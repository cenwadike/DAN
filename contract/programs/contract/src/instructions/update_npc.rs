use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::events::NpcUpdated;
use crate::states::{Memory, State};

pub fn process_update_npc(
    ctx: Context<UpdateNpc>,
    action: String,
    dialogue: String,
    behavior: String,
) -> Result<()> {
    let memory = &mut ctx.accounts.memory;
    let state = &mut ctx.accounts.state;

    require!(
        state.creator == *ctx.accounts.caller.key,
        ErrorCode::NotCreator
    );

    let new_entry = format!("{}@{}", action, Clock::get()?.unix_timestamp);
    memory.data = if memory.data.len() + new_entry.len() > 1024 {
        new_entry
    } else {
        format!("{},{}", memory.data, new_entry)
    };
    state.dialogue = dialogue.clone();
    state.behavior = behavior.clone();

    emit!(NpcUpdated {
        npc_id: state.npc_id.clone(),
        game_id: state.game_id.clone(),
        creator: *ctx.accounts.caller.key,
        action,
        dialogue,
        behavior,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateNpc<'info> {
    #[account(mut)]
    pub memory: Account<'info, Memory>,
    #[account(mut)]
    pub state: Account<'info, State>,
    pub caller: Signer<'info>,
}
