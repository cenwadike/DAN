#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

mod instructions;
use instructions::*;

mod errors;
mod events;
mod states;

declare_id!("DuZVKU3hHtCQfmh3aTMF34kCkyxpg8D2PWBwrMUwVSL2");

#[program]
pub mod contract {
    use crate::instructions::process_initialize;

    use super::*;

    // Initialize program
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        process_initialize(ctx)
    }

    // Create an NPC template
    pub fn create_template(
        ctx: Context<CreateTemplate>,
        template_id: String,
        name: String,
        base_behavior: String,
    ) -> Result<()> {
        process_create_template(ctx, template_id, name, base_behavior)
    }

    // Initialize an NPC instance for a player
    pub fn init_npc(
        ctx: Context<InitNpc>,
        npc_id: String,
        game_id: String,
        template_id: String,
    ) -> Result<()> {
        process_init_npc(ctx, npc_id, game_id, template_id)
    }

    // Update NPC state and memory (only creator)
    pub fn update_npc(
        ctx: Context<UpdateNpc>,
        action: String,
        dialogue: String,
        behavior: String,
    ) -> Result<()> {
        process_update_npc(ctx, action, dialogue, behavior)
    }

    // Open an HTLC payment channel
    pub fn open_channel(
        ctx: Context<OpenChannel>,
        channel_id: String,
        amount: u64,
        hashlock: [u8; 32],
        timelock: u64,
        template_id: String,
    ) -> Result<()> {
        process_open_channel(ctx, channel_id, amount, hashlock, timelock, template_id)
    }

    // Close channel with secret to claim fees (with royalty to template )
    pub fn close_channel(
        ctx: Context<CloseChannel>,
        channel_id: String,
        secret: String,
        final_balance: u64,
    ) -> Result<()> {
        process_close_channel(ctx, channel_id, secret, final_balance)
    }

    // Claim refund after timelock expires
    pub fn claim_refund(ctx: Context<ClaimRefund>, channel_id: String) -> Result<()> {
        process_claim_refund(ctx, channel_id)
    }
}
