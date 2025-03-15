use anchor_lang::prelude::*;

pub fn process_initialize(ctx: Context<Initialize>) -> Result<()> {
    msg!("Greetings from: {:?}", ctx.program_id);
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize {}
