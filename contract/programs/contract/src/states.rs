use anchor_lang::prelude::*;

#[account]
pub struct Template {
    pub creator: Pubkey,
    pub name: String,
    pub base_behavior: String,
}

#[account]
pub struct Memory {
    pub data: String,
}

#[account]
pub struct State {
    pub creator: Pubkey,
    pub npc_id: String,
    pub game_id: String,
    pub dialogue: String,
    pub behavior: String,
}

#[account]
pub struct PaymentChannel {
    pub owner: Pubkey,
    pub counter_party: Pubkey,
    pub balance: u64,
    pub hashlock: [u8; 32],
    pub timelock: u64,
    pub template_creator: Pubkey,
}
