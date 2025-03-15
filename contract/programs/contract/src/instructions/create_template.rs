use anchor_lang::prelude::*;

use crate::{events::TemplateCreated, states::Template};

#[allow(unused_variables)]
pub fn process_create_template(
    ctx: Context<CreateTemplate>,
    template_id: String,
    name: String,
    base_behavior: String,
) -> Result<()> {
    let template = &mut ctx.accounts.template;
    template.creator = *ctx.accounts.caller.key;
    template.name = name.clone();
    template.base_behavior = base_behavior.clone();

    emit!(TemplateCreated {
        template_id,
        creator: *ctx.accounts.caller.key,
        name,
        base_behavior,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(template_id: String)]
pub struct CreateTemplate<'info> {
    #[account(
        init,
        payer = caller,
        seeds = [b"template", template_id.as_bytes()],
        bump,
        space = 8 + 32 + 32 + 32
    )]
    pub template: Account<'info, Template>,
    #[account(mut)]
    pub caller: Signer<'info>,
    pub system_program: Program<'info, System>,
}
