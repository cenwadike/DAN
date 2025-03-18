use anchor_lang::prelude::*;

use crate::{
    events::ChannelOpened,
    states::{PaymentChannel, Template},
};

// Open an HTLC payment channel
#[allow(unused_variables)]
pub fn process_open_channel(
    ctx: Context<OpenChannel>,
    channel_id: String,
    amount: u64,
    hashlock: [u8; 32],
    timelock: u64,
    template_id: String,
) -> Result<()> {
    let channel = &mut ctx.accounts.channel;
    channel.owner = *ctx.accounts.caller.key;
    channel.balance = amount;
    channel.hashlock = hashlock;
    channel.timelock = timelock;
    channel.template_creator = ctx.accounts.template.creator;
    channel.counter_party = ctx.accounts.counter_party.key();
    channel.bump = ctx.bumps.channel;

    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.caller.to_account_info(),
                to: ctx.accounts.channel.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(ChannelOpened {
        channel_id,
        owner: *ctx.accounts.caller.key,
        amount,
        hashlock,
        timelock,
        template_creator: ctx.accounts.template.creator,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(channel_id: String, amount: u64, hashlock: [u8; 32], timelock: u64, template_id: String)]
pub struct OpenChannel<'info> {
    #[account(
        init,
        payer = caller,
        seeds = [b"channel", caller.key().as_ref(), channel_id.as_bytes()],
        bump,
        space = 8 + 32 + 32 + 8 + 32 + 8 + 32 + 2
    )]
    pub channel: Account<'info, PaymentChannel>,
    #[account(mut)]
    pub caller: Signer<'info>,
    /// CHECK: 
    #[account(mut)]
    pub counter_party: UncheckedAccount<'info>,
    #[account(seeds = [b"template", template_id.as_bytes()], bump)]
    pub template: Account<'info, Template>,
    pub system_program: Program<'info, System>,
}
