import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Contract } from "../target/types/contract";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("contract", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Contract as Program<Contract>;

  // Keypair for the caller
  const caller = provider.wallet.publicKey;

  // Helper function to generate a hashlock (32-byte array)
  const generateHashlock = () => Buffer.alloc(32, "deadbeef").toJSON().data;

  it("Is initialized!", async () => {
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
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const templateAccount = await program.account.template.fetch(templatePda);
    assert.equal(templateAccount.name, name);
    assert.equal(templateAccount.baseBehavior, baseBehavior);
    assert.equal(templateAccount.creator.toString(), caller.toString());
  });

  it("Opens a payment channel", async () => {
    const channelId = "channel1";
    const templateId = "template1";
    const amount = new anchor.BN(1000000); // 1 SOL in lamports
    const hashlock = generateHashlock();
    const timelock = new anchor.BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

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
    const secret = Buffer.alloc(32, "secret").toJSON().data; // Dummy secret
    const finalBalance = new anchor.BN(500000); // Half of initial amount

    const [channelPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("channel"), caller.toBuffer(), Buffer.from(channelId)],
      program.programId
    );

    // Dummy accounts for template_creator, channel_owner, and counter_party
    const templateCreator = new anchor.web3.Keypair().publicKey;
    const channelOwner = caller;
    const channelCounterParty = new anchor.web3.Keypair().publicKey;

    await program.methods
      .closeChannel(channelId, secret, finalBalance)
      .accounts({
        channel: channelPda,
        caller: caller,
        templateCreator: templateCreator,
        channelOwner: channelOwner,
        channelCounterParty: channelCounterParty,
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