import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Contract } from "../target/types/contract";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { createHash } from "crypto";

describe("contract", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Contract as Program<Contract>;

  // Keypair for the caller
  const caller = provider.wallet.publicKey;
  const counterParty = caller;

  // Helper function to generate a hashlock (32-byte array)
  const generateHashlock = () => Buffer.alloc(32, "deadbeef").toJSON().data;

  it("Is initialized!", async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(caller, 10 * LAMPORTS_PER_SOL),
      "confirmed"
    );

    await program.methods.initialize()
    .accounts({})
    .rpc()
  });
 
  it("Creates a template", async () => {
    const templateId = "template1";
    const name = "Test Template";
    const baseBehavior = "Default Behavior";

    const [templatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("template"), Buffer.from(templateId)],
      program.programId
    );

    await program.methods
      .createTemplate(templateId, name, baseBehavior)
      .accounts({
        template: templatePda,
        caller: caller,
      })
      .rpc();

    const templateAccount = await program.account.template.fetch(templatePda);
    assert.equal(templateAccount.name, name);
    assert.equal(templateAccount.baseBehavior, baseBehavior);
    assert.equal(templateAccount.creator.toString(), caller.toString());
  });

  it("Initializes an NPC", async () => {
    const npcId = "npc1";
    const gameId = "game1";
    const templateId = "template1";

    const [memoryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("memory"), caller.toBuffer(), Buffer.from(npcId), Buffer.from(gameId)],
      program.programId
    );

    const [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("state"), caller.toBuffer(), Buffer.from(npcId), Buffer.from(gameId)],
      program.programId
    );

    const [templatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("template"), Buffer.from(templateId)],
      program.programId
    );

    await program.methods
      .initNpc(npcId, gameId, templateId)
      .accounts({
        memory: memoryPda,
        state: statePda,
        template: templatePda,
        caller: caller,
      })
      .rpc();

    const memoryAccount = await program.account.memory.fetch(memoryPda);
    const stateAccount = await program.account.state.fetch(statePda);
    const templateAccount = await program.account.template.fetch(templatePda);

    assert.equal(memoryAccount.data, "", "Memory data should be empty");
    assert.equal(stateAccount.dialogue, "", "State dialogue should be empty");
    assert.equal(stateAccount.behavior, templateAccount.baseBehavior, "Behavior should match template");
    assert.equal(stateAccount.creator.toString(), caller.toString(), "Creator should match caller");
  });

  it("Updates an NPC", async () => {
    const npcId = "npc1";
    const gameId = "game1";
    const action = "interact";
    const dialogue = "Hello, adventurer!";
    const behavior = "friendly";

    const [memoryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("memory"), caller.toBuffer(), Buffer.from(npcId), Buffer.from(gameId)],
      program.programId
    );

    const [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("state"), caller.toBuffer(), Buffer.from(npcId), Buffer.from(gameId)],
      program.programId
    );

    await program.methods
      .updateNpc(action, dialogue, behavior)
      .accounts({
        memory: memoryPda,
        state: statePda,
        caller: caller,
      })
      .rpc();

    const memoryAccount = await program.account.memory.fetch(memoryPda);
    const stateAccount = await program.account.state.fetch(statePda);

    const newEntry = memoryAccount.data.split(",").pop();
    const [updatedAction, timestamp] = newEntry.split("@");
    assert.equal(updatedAction, action, "Action should match");

    assert.equal(stateAccount.dialogue, dialogue, "Dialogue should be updated");
    assert.equal(stateAccount.behavior, behavior, "Behavior should be updated");
    assert.equal(stateAccount.creator.toString(), caller.toString(), "Creator should remain unchanged");

    // Test creator restriction
    const otherCaller = anchor.web3.Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(otherCaller.publicKey, LAMPORTS_PER_SOL),
      "confirmed"
    );

    try {
      await program.methods
        .updateNpc("attack", "Die!", "hostile")
        .accounts({
          memory: memoryPda,
          state: statePda,
          caller: otherCaller.publicKey,
        })
        .signers([otherCaller])
        .rpc();
      assert.fail("Non-creator should not be able to update NPC");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "NotCreator", "Should fail with NotCreator error");
    }
  });

  it("Opens a payment channel", async () => {
    const channelId = "channel1";
    const templateId = "template1";
    const amount = new anchor.BN(1000000); // 1 SOL in lamports
    const secret = Buffer.from("mysecret"); // Secret preimage
    const hashlockBuffer = createHash("sha256").update(secret).digest(); // SHA-256 hash as Buffer
    const hashlock = Array.from(hashlockBuffer);  // Convert Buffer to number[]
    const timelock = new anchor.BN(Math.floor(Date.now() / 1000) + 1); // 1 sec from now

    const [channelPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("channel"), caller.toBuffer(), Buffer.from(channelId)],
      program.programId
    );

    const [templatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("template"), Buffer.from(templateId)],
      program.programId
    );

    await program.methods
      .openChannel(channelId, amount, hashlock, timelock, templateId)
      .accounts({
        channel: channelPda,
        caller: caller,
        counterParty: counterParty,
        template: templatePda,
      })
      .rpc();

    const channelAccount = await program.account.paymentChannel.fetch(channelPda);
    assert.equal(channelAccount.owner.toString(), caller.toString());
    assert.equal(channelAccount.balance.toString(), amount.toString());
    assert.deepEqual(channelAccount.hashlock, hashlock);
    assert.equal(channelAccount.timelock.toString(), timelock.toString());
  });

  it("Closes a payment channel", async () => {
    const channelId = "channel1";
    const secret = "mysecret"
    const finalBalance = new anchor.BN(500000); // Half of initial amount

    const [channelPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("channel"), caller.toBuffer(), Buffer.from(channelId)],
      program.programId
    );

    // Dummy accounts for template_creator, channel_owner, and counter_party
    const channelOwner = caller;

    await program.methods
      .closeChannel(channelId, secret, finalBalance)
      .accounts({
        channel: channelPda,
        caller: caller,
        templateCreator: caller,
        channelOwner: channelOwner,
        channelCounterParty: counterParty,
      })
      .rpc();

    // Verify channel is closed (account should be updated accordingly)
    try {
      const balance = (await program.account.paymentChannel.fetch(channelPda)).balance;
      assert.equal(balance, new anchor.BN(0));
    } catch (err) {
      assert.ok(err.message.includes("Account does not exist"));
    }
  });

  it("Claims a refund", async () => {
    const channelId = "channel2";
    const amount = new anchor.BN(1000000);
    const hashlock = generateHashlock();
    const timelock = new anchor.BN(Math.floor(Date.now() / 1000) - 1); // Expired timelock

    const [channelPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("channel"), caller.toBuffer(), Buffer.from(channelId)],
      program.programId
    );

    const [templatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("template"), Buffer.from("template1")],
      program.programId
    );

    // Open channel first
    await program.methods
      .openChannel(channelId, amount, hashlock, timelock, "template1")
      .accounts({
        channel: channelPda,
        caller: caller,
        counterParty: counterParty,
        template: templatePda,
      })
      .rpc();

    // Claim refund
    await program.methods
      .claimRefund(channelId)
      .accounts({
        channel: channelPda,
        caller: caller,
      })
      .rpc();

    // Verify refund claimed (balance zeroed)
    try {
      const balance = (await program.account.paymentChannel.fetch(channelPda)).balance;
      assert.equal(balance, new anchor.BN(0));
    } catch (err) {
      assert.ok(err.message.includes("Account does not exist"));
    }
  });
});