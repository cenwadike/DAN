# Decentralized Adaptive NPC (DAN)

DAN is a toolkit for game developers to integrate adaptive, AI-driven NPCs into Sonic SVM-based games. 
It combines a REST API, Sonic smart contract, and Hashed Time Lock (HTLC) payment channels to deliver scalable NPC behavior and secure micro transactions.

## Features

- Reusable NPC templates.
- Verifiable NPC memory and state.
- AI-driven adaptive NPCs dialogue and behaviour.
- Lightling fast micropayments for in-game transactions.

## How It Works

- Anyone can create NPC templates.
- Others can create new NPC using template.
- AI generate NPC dialogue and behavior from onchain memory and state.
- In-game transactions using fast and secure payment channels.
  
## How to test

### Install the following:
- NPM (latest version)
- Node (latest version)
- curl

### Update the .env file

-   Ensure your .env file is configured with the required variables (e.g., SOLANA_RPC_URL, OPENAI_API_KEY, SERVER_SECRET_KEY, etc.).

    ```bash
        SOLANA_RPC_URL=https://api.testnet.sonic.game/
        PROGRAM_ID=FKehpJ8SZkr7XW4tysqoP7N6eLvpG3WASiXZa7JTjWUd
        OPENAI_API_KEY=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
        FEE_ACCOUNT=4GK6rjy5EuuLJ4Xo4fuVjtf7LabxVq2QSJDx3rpqMcHv
        SERVER_SECRET_KEY=YourPrivateKey
        PORT=8000
    ```

## Steps to Test the APIs Manually

### Start the Server:

- Run the server: `npm run start`.

### Test Health Endpoint:
- Use the curl command for `/health` to verify the server is running.

### Register a User:
- Use the `/register` endpoint to register a wallet and obtain an API key.
- Save the apiKey for use in authenticated requests.

### Create an NPC Template:
- Use the `/create-npc-template` endpoint to create a template on the blockchain.
- Verify the transaction on the Solana blockchain (e.g., using Solana Explorer).

### Create a Payment Channel:
- Send SOL to the **serverWallet.publicKey** using a Solana wallet or CLI command (e.g., solana transfer).
- The server will automatically detect the transfer and create a payment channel (check `channels.json` for the channelId).

### Update an NPC:
- Use the `/update-npc` endpoint with a valid channelId to initialize or update an NPC.
- Check the response for the transaction signature or serialized transaction.

### Get NPC State:
- Use the `/get-npc-state` endpoint to retrieve the NPC’s current state.
- Verify the dialogue and behavior match the expected OpenAI response.

### Close the Payment Channel:
- Use the `/close-payment-channel` endpoint to close the channel.
- Verify the transaction on the blockchain and check that the channel is removed from channels.json.
