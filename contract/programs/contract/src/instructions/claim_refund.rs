use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::events::RefundClaimed;
use crate::states::PaymentChannel;

#[allow(unused_variables)]
pub fn process_claim_refund(ctx: Context<ClaimRefund>, channel_id: String) -> Result<()> {
    let channel = &mut ctx.accounts.channel;
    let now = Clock::get()?.unix_timestamp as u64;

    require!(now >= channel.timelock, ErrorCode::TimelockNotExpired);
    require!(
        ctx.accounts.caller.key() == channel.counter_party,
        ErrorCode::WrongChannelCounterParty
    );

    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: channel.to_account_info(),
                to: ctx.accounts.caller.to_account_info(),
            },
        ),
        channel.balance,
    )?;

    emit!(RefundClaimed {
        channel_id,
        owner: channel.owner,
        amount: channel.balance,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(channel_id: String)]
pub struct ClaimRefund<'info> {
    #[account(
        mut,
        seeds = [b"channel", caller.key().as_ref(), channel_id.as_bytes()],
        bump,
        close = caller
    )]
    pub channel: Account<'info, PaymentChannel>,
    #[account(mut)]
    pub caller: Signer<'info>,
    pub system_program: Program<'info, System>,
}
