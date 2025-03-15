use anchor_lang::prelude::*;

#[event]
pub struct TemplateCreated {
    pub template_id: String,
    pub creator: Pubkey,
    pub name: String,
    pub base_behavior: String,
}

#[event]
pub struct NpcInitialized {
    pub npc_id: String,
    pub game_id: String,
    pub creator: Pubkey,
    pub template_id: String,
}

#[event]
pub struct NpcUpdated {
    pub npc_id: String,
    pub game_id: String,
    pub creator: Pubkey,
    pub action: String,
    pub dialogue: String,
    pub behavior: String,
}

#[event]
pub struct ChannelOpened {
    pub channel_id: String,
    pub owner: Pubkey,
    pub amount: u64,
    pub hashlock: [u8; 32],
    pub timelock: u64,
    pub template_creator: Pubkey,
}

#[event]
pub struct ChannelClosed {
    pub channel_id: String,
    pub owner: Pubkey,
    pub fee: u64,
    pub royalty: u64,
    pub refund: u64,
    pub template_creator: Pubkey,
}

#[event]
pub struct RefundClaimed {
    pub channel_id: String,
    pub owner: Pubkey,
    pub amount: u64,
}
