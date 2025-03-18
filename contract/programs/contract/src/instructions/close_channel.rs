use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

use crate::errors::ErrorCode;
use crate::events::ChannelClosed;
use crate::states::PaymentChannel;

#[allow(unused_variables)]
pub fn process_close_channel(
    ctx: Context<CloseChannel>,
    channel_id: String,
    secret: String,
    final_balance: u64,
) -> Result<()> {
    let channel = &mut ctx.accounts.channel;
    let now = Clock::get()?.unix_timestamp as u64;

    // Ensure timelock hasn't expired
    require!(now < channel.timelock, ErrorCode::TimelockExpired);

    // Verify the secret matches the hashlock
    let secret_bytes = secret.as_bytes();
    let secret_hash = hash(&secret_bytes);
    require!(
        secret_hash.to_bytes() == channel.hashlock,
        ErrorCode::InvalidSecret
    );

    // Verify account ownership
    require!(
        ctx.accounts.channel_owner.key() == channel.owner,
        ErrorCode::WrongChannelOwner
    );
    require!(
        ctx.accounts.channel_counter_party.key() == channel.counter_party,
        ErrorCode::WrongChannelCounterParty
    );
    require!(
        ctx.accounts.template_creator.key() == channel.template_creator,
        ErrorCode::WrongTemplateCreator
    );

    let total_lamports = channel.to_account_info().lamports();
    require!(total_lamports >= final_balance, ErrorCode::InsufficientFunds);

    let refund_balance = total_lamports - final_balance;
    let royalty = final_balance / 5; // 20% royalty to template creator
    let fee = final_balance - royalty;

    // Direct lamport transfers instead of CPI
    **channel.to_account_info().try_borrow_mut_lamports()? -= royalty;
    **ctx.accounts.template_creator.to_account_info().try_borrow_mut_lamports()? += royalty;

    **channel.to_account_info().try_borrow_mut_lamports()? -= fee;
    **ctx.accounts.channel_owner.to_account_info().try_borrow_mut_lamports()? += fee;

    **channel.to_account_info().try_borrow_mut_lamports()? -= refund_balance;
    **ctx.accounts.channel_counter_party.to_account_info().try_borrow_mut_lamports()? += refund_balance;

    emit!(ChannelClosed {
        channel_id,
        owner: channel.owner,
        fee,
        royalty,
        refund: refund_balance,
        template_creator: channel.template_creator,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(channel_id: String)]
pub struct CloseChannel<'info> {
    #[account(
        mut,
        seeds = [b"channel", channel.owner.as_ref(), channel_id.as_bytes()],
        bump = channel.bump,
        close = caller
    )]
    pub channel: Account<'info, PaymentChannel>,
    #[account(mut)]
    pub caller: Signer<'info>,
    /// CHECK: Validated in instruction
    #[account(mut)]
    pub template_creator: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction
    #[account(mut)]
    pub channel_owner: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction
    #[account(mut)]
    pub channel_counter_party: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
