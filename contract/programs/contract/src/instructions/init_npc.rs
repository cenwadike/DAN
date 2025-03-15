use anchor_lang::prelude::*;

use crate::{
    events::NpcInitialized,
    states::{Memory, State, Template},
};

#[allow(unused_variables)]
pub fn process_init_npc(
    ctx: Context<InitNpc>,
    npc_id: String,
    game_id: String,
    template_id: String,
) -> Result<()> {
    let memory = &mut ctx.accounts.memory;
    let state = &mut ctx.accounts.state;

    memory.data = String::new();
    state.dialogue = String::new();
    state.behavior = ctx.accounts.template.base_behavior.clone();
    state.creator = *ctx.accounts.caller.key;

    emit!(NpcInitialized {
        npc_id,
        game_id,
        creator: *ctx.accounts.caller.key,
        template_id,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(npc_id: String, game_id: String, template_id: String)]
pub struct InitNpc<'info> {
    #[account(
        init,
        payer = caller,
        seeds = [b"memory", caller.key().as_ref(), npc_id.as_bytes(), game_id.as_bytes()],
        bump,
        space = 8 + 1024
    )]
    pub memory: Account<'info, Memory>,
    #[account(
        init,
        payer = caller,
        seeds = [b"state", caller.key().as_ref(), npc_id.as_bytes(), game_id.as_bytes()],
        bump,
        space = 8 + 32 + 32 + 32 + 32 + 32
    )]
    pub state: Account<'info, State>,
    #[account(seeds = [b"template", template_id.as_bytes()], bump)]
    pub template: Account<'info, Template>,
    #[account(mut)]
    pub caller: Signer<'info>,
    pub system_program: Program<'info, System>,
}
