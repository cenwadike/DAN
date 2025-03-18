use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid secret provided")]
    InvalidSecret,
    #[msg("Not the channel owner")]
    NotOwner,
    #[msg("Timelock has expired")]
    TimelockExpired,
    #[msg("Timelock has not yet expired")]
    TimelockNotExpired,
    #[msg("Only the NPC creator can update this NPC")]
    NotCreator,
    #[msg("Incorrect channel owner account")]
    WrongChannelOwner,
    #[msg("Incorrect channel counter-party account")]
    WrongChannelCounterParty,
    #[msg("Incorrect template creator account")]
    WrongTemplateCreator,
    #[msg("Balance must me more than 0.")]
    InsufficientFunds,
}
