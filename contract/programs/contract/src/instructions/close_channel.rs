use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

use crate::errors::ErrorCode;
use crate::events::ChannelClosed;
use crate::states::PaymentChannel;

#[allow(unused_variables)]
pub fn process_close_channel(
    ctx: Context<CloseChannel>,
    channel_id: String,
    secret: [u8; 32],
    final_balance: u64,
) -> Result<()> {
    let channel = &mut ctx.accounts.channel;
    let now = Clock::get()?.unix_timestamp as u64;
    require!(now < channel.timelock, ErrorCode::TimelockExpired);
    require!(
        hash(&secret) == channel.hashlock.into(),
        ErrorCode::InvalidSecret
    );
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

    let refund_balance = channel.balance - final_balance;
    let royalty = final_balance / 5; // 20% royalty to template creator
    let fee = final_balance - royalty;

    // Transfer royalty to template creator
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: channel.to_account_info(),
                to: ctx.accounts.template_creator.to_account_info(),
            },
        ),
        royalty,
    )?;

    // Transfer remaining fee to channel creator
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: channel.to_account_info(),
                to: ctx.accounts.channel_owner.to_account_info(),
            },
        ),
        fee,
    )?;

    // Send refund to counter-party
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: channel.to_account_info(),
                to: ctx.accounts.channel_counter_party.to_account_info(),
            },
        ),
        refund_balance,
    )?;

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
        bump,
        close = caller
    )]
    pub channel: Account<'info, PaymentChannel>,
    #[account(mut)]
    pub caller: Signer<'info>,
    /// CHECK: safe
    #[account(mut)]
    pub template_creator: UncheckedAccount<'info>,
    /// CHECK: safe
    #[account(mut)]
    pub channel_owner: UncheckedAccount<'info>,
    /// CHECK: safe
    #[account(mut)]
    pub channel_counter_party: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
