import express, { NextFunction, Request, Response } from "express";
import { Connection, PublicKey, Transaction, SystemProgram, Keypair, ParsedInstruction } from "@solana/web3.js";
import { Program, AnchorProvider, Idl } from "@project-serum/anchor";
import { OpenAI } from "openai";
import { randomBytes, createHash } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import * as dotenv from "dotenv";
import winston from "winston";
import * as schedule from "node-schedule";
import { v4 as uuidv4 } from "uuid";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import bs58 from 'bs58';
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json({ limit: "1mb" }));

// Logger setup
const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: path.join(__dirname, "logs/error.log"), level: "error" }),
        new winston.transports.File({ filename: path.join(__dirname, "logs/combined.log") }),
        new winston.transports.Console({ format: winston.format.simple() }),
    ],
});

// Solana and OpenAI setup
const connection = new Connection(process.env.RPC_URL || "https://api.testnet.sonic.game", "confirmed");
const programId = new PublicKey(process.env.PROGRAM_ID!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const feeAccount = new PublicKey(process.env.FEE_ACCOUNT!);
const serverWallet = getWallet(process.env.SERVER_SECRET_KEY!.trim());

// Persistent storage
const USERS_FILE = path.join(__dirname, "data/users.json");
const CHANNELS_FILE = path.join(__dirname, "data/channels.json");

interface User {
    apiKey: string; // Hashed
    createdAt: number;
    wallet: string; // Sender's public key
}
interface ChannelState {
    userId: string; // Sender's wallet as userId
    balance: number;
    secret: string; // Hashed
    nonce: number;
    templateId: string;
    createdAt: number;
    fundingTx: string;
}

interface NPCTemplate {
    creator: PublicKey,
    name: string,
    base_behavior: string,
}

export function getWallet(wallet: string): Keypair {
    try {
        // Case 1: JSON array (e.g., "[1,2,3,...]")
        if (wallet.startsWith("[")) {
            const raw = new Uint8Array(JSON.parse(wallet));
            return Keypair.fromSecretKey(raw);
        }

        // Case 2: Mnemonic phrase (multiple words)
        if (wallet.split(" ").length > 1) {
            const seed = mnemonicToSeedSync(wallet, "");
            const path = `m/44'/501'/0'/0'`;
            return Keypair.fromSeed(derivePath(path, seed.toString("hex")).key);
        }

        // Case 3: Base64-encoded key (e.g., from base64 command)
        if (/^[A-Za-z0-9+/=]+$/.test(wallet)) {
            const decoded = Buffer.from(wallet, "base64");
            if (decoded.length === 64) {
                return Keypair.fromSecretKey(decoded);
            }
        }

        // Case 4: Base58-encoded key (default)
        return Keypair.fromSecretKey(bs58.decode(wallet));
    } catch (e) {
        throw new Error(`Invalid SERVER_SECRET_KEY format: ${(e as Error).message}`);
    }
}

const loadUsers = async (): Promise<{ [key: string]: User }> => {
    try {
        const data = await fs.readFile(USERS_FILE, "utf8");
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
};
const saveUsers = async (users: { [key: string]: User }) => {
    await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
};

const loadChannels = async (): Promise<{ [key: string]: ChannelState }> => {
    try {
        const data = await fs.readFile(CHANNELS_FILE, "utf8");
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
};
const saveChannels = async (channels: { [key: string]: ChannelState }) => {
    await fs.mkdir(path.dirname(CHANNELS_FILE), { recursive: true });
    await fs.writeFile(CHANNELS_FILE, JSON.stringify(channels, null, 2));
};

// Load IDL
const idl = require("./idl.json") as Idl;

// PDA helper
const getPda = (prefix: string, caller: PublicKey, id: string, extra?: string): PublicKey =>
    PublicKey.findProgramAddressSync(
        [Buffer.from(prefix), caller.toBuffer(), Buffer.from(id), ...(extra ? [Buffer.from(extra)] : [])],
        programId
    )[0];

// Error handler
const handleError = (res: Response, error: any, message: string, status: number = 500) => {
    logger.error(`${message}: ${error.message}`);
    res.status(status).json({ error: message, details: error.message });
};

// Rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: "Too many requests, please try again later" },
});

// Authentication middleware
const authenticate = async (req: Request, res: Response, next: () => void) => {
    const apiKey = req.headers["x-api-key"] as string;
    if (!apiKey) return handleError(res, new Error("Missing API key"), "API key required", 401);

    const users = await loadUsers();
    const userId = Object.keys(users).find(async id => await bcrypt.compare(apiKey, users[id].apiKey));
    if (!userId) return handleError(res, new Error("Invalid API key"), "Authentication failed", 403);

    (req as any).userId = userId;
    next();
};

// Periodic channel closure
const closeChannels = async () => {
    const channels = await loadChannels();
    const now = Math.floor(Date.now() / 1000);
    const eightHoursInSeconds = 8 * 60 * 60;

    for (const [channelId, channel] of Object.entries(channels)) {
        if (now - channel.createdAt >= eightHoursInSeconds) {
            try {
                const program = new Program(idl, programId, new AnchorProvider(connection, { publicKey: serverWallet.publicKey, signTransaction: async (tx: Transaction) => tx } as any, {}));
                const caller = serverWallet.publicKey;
                const templatePda = getPda("template", caller, channel.templateId);
                const template = await program.account.template.fetch(templatePda) as any as NPCTemplate;
                const channelPda = getPda("channel", caller, channelId);

                await program.methods
                    .closeChannel(channelId, channel.secret, channel.balance)
                    .accounts({
                        channel: channelPda,
                        caller,
                        templateCreator: template.creator,
                        channelOwner: feeAccount,
                        channelCounterParty: new PublicKey(channel.userId),
                    })
                    .rpc()
                delete channels[channelId];
                logger.info(`Channel ${channelId} closed automatically after 8 hours`);
            } catch (e) {
                logger.error(`Failed to close channel ${channelId}: ${(e as Error).message}`);
            }
        }
    }
    await saveChannels(channels);
};

// Poll blockchain for transfers and auto-create channels
const pollBlockchain = async () => {
    let lastSlot = await connection.getSlot();
    connection.onSlotChange(async (slotInfo) => {
        const currentSlot = slotInfo.slot;
        if (currentSlot <= lastSlot) return;
        lastSlot = currentSlot;

        try {
            const signatures = await connection.getSignaturesForAddress(serverWallet.publicKey, { until: undefined });
            const channels = await loadChannels();
            const users = await loadUsers();

            for (const sig of signatures) {
                const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
                if (!tx || tx.meta?.err || channels[sig.signature]) continue;

                const transfer = tx.transaction.message.instructions.find((instr) => {
                    // Ensure the instruction is a ParsedInstruction and not PartiallyDecodedInstruction
                    if (
                        "parsed" in instr && // Type guard to check for parsed property
                        instr.programId.equals(SystemProgram.programId) &&
                        instr.parsed?.type === "transfer" &&
                        instr.parsed.info.destination === serverWallet.publicKey.toBase58()
                    ) {
                        return true;
                    }
                    return false;
                }) as ParsedInstruction | undefined;
                
                if (transfer) {
                    const sender = tx.transaction.message.accountKeys[0].pubkey.toBase58(); // Assuming sender is first account
                    const amount = transfer.parsed.info.lamports;
                    const channelId = sig.signature; // Unique channel ID from tx signature

                    let userId = Object.keys(users).find(id => users[id].wallet === sender);
                    if (!userId) {
                        userId = sender; // Use wallet as userId
                        const apiKey = uuidv4();
                        users[userId] = {
                            apiKey: await bcrypt.hash(apiKey, 10),
                            createdAt: Math.floor(Date.now() / 1000),
                            wallet: sender,
                        };
                        await saveUsers(users);
                        logger.info(`Auto-registered user ${userId} with wallet ${sender}`);
                    }

                    const secret = randomBytes(32).toString("hex");
                    const hashlock = createHash("sha256").update(secret).digest();
                    const timelock = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
                    const templateId = "default"; // Default template; customizable in production

                    const program = new Program(idl, programId, new AnchorProvider(connection, { publicKey: serverWallet.publicKey, signTransaction: async (tx: Transaction) => tx } as any, {}));
                    await program.methods
                        .openChannel(channelId, amount, [...hashlock], timelock, templateId)
                        .accounts({
                            channel: getPda("channel", serverWallet.publicKey, channelId),
                            caller: serverWallet.publicKey,
                            counterParty: new PublicKey(userId),
                            template: getPda("template", serverWallet.publicKey, templateId),
                        })
                        .rpc()

                    channels[channelId] = {
                        userId,
                        balance: amount,
                        secret: await bcrypt.hash(secret, 10),
                        nonce: 0,
                        templateId,
                        createdAt: Math.floor(Date.now() / 1000),
                        fundingTx: sig.signature,
                    };
                    await saveChannels(channels);
                    logger.info(`Auto-created channel ${channelId} for user ${userId} with ${amount / 1e9} SOL`);
                }
            }
        } catch (e) {
            logger.error(`Blockchain polling failed: ${(e as Error).message}`);
        }
    });
};

// API Endpoints
app.post("/register", limiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { wallet } = req.body; // Optional: User provides wallet
        if (!wallet) {
            res.status(400).json({ error: "Wallet address required" });
            return;
        }
        const apiKey = uuidv4();
        const userId = wallet; // Use wallet as userId
        const users = await loadUsers();
        if (users[userId]) {
            res.json({ userId, apiKey: "Already registered, use existing API key" });
            return;
        }
        users[userId] = {
            apiKey: await bcrypt.hash(apiKey, 10),
            createdAt: Math.floor(Date.now() / 1000),
            wallet,
        };
        await saveUsers(users);
        res.json({ userId, apiKey });
        logger.info(`User registered: ${userId} with wallet ${wallet}`);
    } catch (e) {
        handleError(res, e, "Failed to register user");
    }
});

app.post("/create-npc-template", limiter, authenticate, async (req: Request, res: Response) => {
    try {
        const { templateId, name, baseBehavior } = req.body;
        if (!templateId || !name || !baseBehavior) throw new Error("Missing required fields");
        const caller = serverWallet.publicKey;
        const provider = new AnchorProvider(
            connection,
            { publicKey: serverWallet.publicKey } as any,
            { commitment: "confirmed" }
        );
        const program = new Program(idl, programId, provider);
        const txId = program.methods
            .createTemplate(templateId, name, baseBehavior)
            .accounts({
                template: getPda("template", caller, templateId),
                caller,
            })
            .rpc()
        res.json({ transaction: txId });
        logger.info(`Template created: ${templateId} by user ${(req as any).userId}`);
    } catch (e) {
        handleError(res, e, "Failed to create NPC template");
    }
});

app.post("/update-npc", limiter, authenticate, async (req: Request, res: Response) => {
    try {
        const { npcId, gameId, action, channelId, templateId } = req.body;
        if (!npcId || !gameId || !action || !channelId || !templateId) throw new Error("Missing required fields");
        const caller = serverWallet.publicKey;

        const channels = await loadChannels();
        const channel = channels[channelId];
        if (!channel) return handleError(res, new Error("Channel not found"), "Channel not found", 404);
        if (channel.userId !== (req as any).userId) {
            logger.warn(`Unauthorized attempt to spend from channel ${channelId} by user ${(req as any).userId}`);
            return handleError(res, new Error("Unauthorized"), "Only the channel creator can spend from this channel", 403);
        }
        if (channel.balance < 1_000) {
            logger.warn(`Insufficient balance for channel ${channelId}`);
            return handleError(res, new Error("Insufficient funds"), "Insufficient channel balance", 402);
        }
        channel.balance -= 1_000;
        channel.nonce++;
        await saveChannels(channels);

        const memoryPda = getPda("memory", caller, npcId, gameId);
        const statePda = getPda("state", caller, npcId, gameId);

        let memory = "";
        try {
            const provider = new AnchorProvider(
                connection,
                { publicKey: serverWallet.publicKey } as any,
                { commitment: "confirmed" }
            );
            const program = new Program(idl, programId, provider);
            const memoryAccount = await program.account.memory.fetch(memoryPda);
            memory = memoryAccount.data as string;
        } catch (e) {
            const txId = await new Program(idl, programId, new AnchorProvider(
                connection, 
                { publicKey: serverWallet.publicKey } as any,
                { commitment: "confirmed" })
            ).methods
                .initNpc(npcId, gameId, templateId)
                .accounts({
                    memory: memoryPda,
                    state: statePda,
                    template: getPda("template", caller, templateId),
                    caller,
                })
                .rpc();

            res.json({ transaction: txId });
            logger.info(`NPC initialized: ${npcId} in game ${gameId} by user ${(req as any).userId}`);
            return;
        }

        const prompt = `NPC past: ${memory || "none"}. Action: ${action}. Reply with dialogue|behavior (HOSTILE, FRIENDLY, etc.).`;
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 50,
            temperature: 0.7,
        });
        const [dialogue, behavior] = response.choices[0].message.content!.split("|");

        const tx = new Transaction().add(
            await new Program(idl, programId, new AnchorProvider(
                connection, 
                { publicKey: serverWallet.publicKey } as any,
                { commitment: "confirmed" })).methods
                .updateNpc(action, dialogue, behavior)
                .accounts({
                    memory: memoryPda,
                    state: statePda,
                    caller,
                })
                .instruction()
        );
        res.json({ transaction: tx.serialize({ requireAllSignatures: false }).toString("base64") });
        logger.info(`NPC updated: ${npcId} in game ${gameId} by user ${(req as any).userId}`);
    } catch (e) {
        handleError(res, e, "Failed to update NPC");
    }
});

app.get("/get-npc-state", limiter, async (req: Request, res: Response) => {
    try {
        const { npcId, gameId } = req.query;
        if (!npcId || !gameId) throw new Error("Missing required query parameters");
        const caller = serverWallet.publicKey;
        const statePda = getPda("state", caller, npcId as string, gameId as string);
        const provider = new AnchorProvider(
            connection, 
            { publicKey: serverWallet.publicKey } as any,
            { commitment: "confirmed" });
        const program = new Program(idl, programId, provider);
        const state = await program.account.state.fetch(statePda);
        res.json({ dialogue: state.dialogue, behavior: state.behavior });
        logger.info(`NPC state retrieved: ${npcId} in game ${gameId}`);
    } catch (e) {
        logger.warn(`NPC state not found: ${(e as Error).message}`);
        res.status(404).json({ error: "NPC state not found" });
    }
});

app.post("/close-payment-channel", limiter, authenticate, async (req: Request, res: Response) => {
    try {
        const { channelId } = req.body;
        if (!channelId) throw new Error("Missing required fields");
        const caller = serverWallet.publicKey;
        const channels = await loadChannels();
        const channel = channels[channelId];
        if (!channel) return handleError(res, new Error("Channel not found"), "Channel not found", 404);
        if (channel.userId !== (req as any).userId) {
            logger.warn(`Unauthorized attempt to close channel ${channelId} by user ${(req as any).userId}`);
            return handleError(res, new Error("Unauthorized"), "Only the channel creator can close this channel", 403);
        }

        const program = new Program(idl, programId, new AnchorProvider(
            connection, 
            { publicKey: serverWallet.publicKey } as any,
            { commitment: "confirmed" }));
        const templatePda = getPda("template", caller, channel.templateId);
        const template = await program.account.template.fetch(templatePda) as any as NPCTemplate;

        const txId = await program.methods
            .closeChannel(channelId, channel.secret, channel.balance)
            .accounts({
                channel: getPda("channel", caller, channelId),
                caller,
                templateCreator: template.creator,
                channelOwner: feeAccount,
                channelCounterParty: new PublicKey(channel.userId),
            })
            .rpc()
        delete channels[channelId];
        await saveChannels(channels);
        res.json({ transaction: txId, secret: channel.secret });
        logger.info(`Channel closed: ${channelId} by user ${(req as any).userId}`);
    } catch (e) {
        handleError(res, e, "Failed to close payment channel");
    }
});

app.get("/health", limiter, (_req: Request, res: Response) => {
    res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, async () => {
    logger.info("Staring server")
    logger.info(`DAN API running on http://localhost:${PORT}`);
    schedule.scheduleJob("0 */8 * * *", () => {
        logger.info("Running periodic channel closure");
        closeChannels().catch(e => logger.error(`Periodic closure failed: ${e.message}`));
    });
    pollBlockchain().catch(e => logger.error(`Blockchain polling failed: ${e.message}`));
    await closeChannels().catch(e => logger.error(`Initial channel closure failed: ${e.message}`));
});
