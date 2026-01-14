
# Lumo API 🧠 

A new Headless version of the Api just arrived :
[Take a Look](https://github.com/carlostkd/Lumo-Api-V2)


<img src="https://pmecdn.protonweb.com/image-transformation/?s=s&image=Lumo_OG_b782facdaf.png" width="300" height="150" />

### The new feature Projects just arrived on time 

### New commands 

*** Create Project ***

```javascript
curl -X POST http://localhost:3000/api/create-project \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "My Test Project",
    "projectInstructions": "Use a formal tone and be concise"
  }'
``` 

*** Upload File or multiple files to the Project ***

```javascript
curl -X POST http://localhost:3000/api/upload-file \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -F "files=@./test2.txt"
```

*** Send prompt to sumarize the files ***

```javascript
curl -X POST http://localhost:3000/api/send-prompt \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Summarize the last uploaded file." }'
```

*** To delete files you can use the same previous commands ***

### Note: In projects is not possible to send files and prompt together

*** Leave the project and return to normal chat ***

```javascript
curl -X POST http://localhost:3000/api/start-new-chat \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

*** To Open a project you need to know the project name ***

```javascript
curl -X POST http://localhost:3000/api/open-project \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{ "projectName": "My Project" }'
```

### The new projects feature was exaustive tested but i let for now the debug code 
### If you find any bug 🪲 please open a issue with the log attached.

### I will try to replicate this on the V2 but no promisses...









# Please read the ![version-3](version-3.0-README.md) for extended features.


Copyright @Carlostkd

warning ⚠️ If you have installed the previous version to use the new features you need install:

npm install multer yaml nodemailer

## warning ⚠️ chat loggin function logs the Ghost chats too useful to keep saved chats on your end but not online.


Welcome to **Lumo API**! 🚀 A powerful and flexible API for interacting with the Lumo AI powered by Proton. 

This API allows you to integrate Proton Lumo Assistante in any of your Projects - web apps or mobile apps. 🎉

## Key Features ✨

- **Send Prompts**: Send messages to Lumo and receive responses to interact with Proton Lumo.
- **Web Search Toggle**: Enable or disable the web search functionality when needed. 🔍
- **Secure API**: Authentication via token security to make sure only authorized users can send requests. 🔑
- **Turn on/off Ghost mode**:👻 No one can sees you
- **Start Fresh**:💬 Start a new chat when you want
- **Upload and delete files**:💬 Always like a pro
- **Chat Logging**:💬 Gives you full controle of yours chat
- **Help Function**: List all available commands
- **Talk with Hmas Api**: 💬 Get Hacker Messages as Service in your projects
- **Lumo-Api can analyze your computer**: 💬 Like a real cybersecurity Cat

## Installation 🛠️

### 1. Clone this repository:
```bash
git clone https://github.com/carlostkd/lumo-api.git
cd lumo-api
```

### 2. Install dependencies:
```bash
npm init -y

npm install express puppeteer-core puppeteer body-parser cors multer nodemailer yaml axios


run the app

node index.js

```

### 3. Set up your token:
In `index.js`, replace `YOUR_SECRET_TOKEN_HERE` with your secret token for API authentication.

### 4. Run the server:
```bash
node index.js

and wait until you see "login detected"
```

The server will be running on `http://localhost:3000`.

## Usage 🏄‍♂️

### Sending a Prompt to Lumo

You can send a prompt using `curl`:

```bash
curl -X POST http://localhost:3000/api/send-prompt   
-H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE"   
-H "Content-Type: application/json"   
-d '{"prompt": "What is the weather in Zurich?"}'
```

You’ll receive a response from the Lumo like:

```json
"The weather in Zurich is clear skies with a temperature of 15°C."
```

### Enabling Web Search

To enable web search (useful for weather, news, etc.):

```bash
curl -X POST http://localhost:3000/api/set-websearch   
-H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE"   
-H "Content-Type: application/json"   
-d '{"enabled": true}'
```

### Disabling Web Search

To disable web search:

```bash
curl -X POST http://localhost:3000/api/set-websearch   
-H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE"   
-H "Content-Type: application/json"   
-d '{"enabled": false}'
```

### Enabling Ghost mode

To enable Ghost Mode :

```bash
curl -X POST http://localhost:3000/api/set-ghostmode \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' 
```

### Disabling Ghost mode

To disable Ghost Mode:

```bash
curl -X POST http://localhost:3000/api/set-ghostmode \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
 ```

### Start New Chat

To start a new chat:

```bash
curl -X POST http://localhost:3000/api/start-new-chat \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json"
 ```

### Upload Files (max 10 dont know the real limit of Lumo...)

Upload file or multi files:

```bash
curl -X POST http://localhost:3000/api/upload-file \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -F "files=@./test.html" \            
  -F "files=@./test2.txt" \
  -F "files=@./test3.txt"
 ```

```bash
curl -X POST http://localhost:3000/api/upload-file \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -F "files=@./test.html"            
```

### Delete Files

To delete one by one or all:

```bash
curl -X POST http://localhost:3000/api/remove-file \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"mode":"all"}'
 ```

```bash
curl -X POST http://localhost:3000/api/remove-file \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"mode":"single"}'
 ```

### Enable chat Logging

### Chat logs are saved when you START A NEW CHAT

Enable Loggin and choose the format (json is default available is txt and csv):

```bash
curl -X POST http://localhost:3000/api/set-save-chat \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "format": "csv"}'
```

### Disable chat Logging

Chat logs are saved when you START A NEW CHAT you can always disable:

```bash
curl -X POST http://localhost:3000/api/set-save-chat \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```


### Show all available commands

```bash
curl http://localhost:3000/api/help
```

## 🔄 Lumo vs. Lumo: The Evolving Function Showdown! 🤖⚡


🥊 Round 1: Lumo vs Lumo-api

💬 How It Works

Send Your Prompt ✉️

Type in your initial question or topic
Let Lumo know what you're curious about

Set the Turns ⚙️

Choose how many back-and-forth exchanges you want
From quick chats to deep dives you're in control!

🔍 Behind the Scenes

Our enhanced code works its magic by:

Analyzing responses in real-time
Identifying key topics and themes
Generating context-aware follow-up questions
Gracefully handling errors to maintain flow

🎯 Why It's Awesome


✅ Natural Conversations: Feels more like talking to a friend than a bot

✅ Smooth Transitions: Effortlessly moves between related topics

✅ Error Resistant: Keeps the conversation going even when things get tricky

✅ Customizable Length: You decide how long the chat should be

✅ Engaging Interactions: Smart follow-ups make conversations more interesting


💡 Try It Out!


```bash
curl -X POST http://localhost:3000/api/send-automated-dialogue \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"initialPrompt": "what is proton lumo", "maxTurns": 30}'
```

Watch the Conversation Flow 🌊

Sit back and enjoy the natural, engaging dialogue
See Lumo smoothly transition between topics
Witness intelligent follow-up questions that keep the conversation lively



## Troubleshooting ⚠️

- **Issue**: No response after sending a prompt.
  - **Solution**: Make sure you're logged in manually in the browser window launched by Puppeteer.

- **Issue**: Invalid token errors.
  - **Solution**: Ensure you are passing the correct token in the `Authorization` header.

## 🙏 Support the Project

If you find Lumo API useful, consider buying me a coffee (or a whole espresso machine). 

Your donation helps keep the AI sharp, the jokes fresh, and the servers humming.  

[Donate Here ➡️](https://donate.stripe.com/8wM6pe9DD99xgAofYZ?locale=en&__embed_source=buy_btn_1Oi3L8AtK4E7C1uiKA4WkkML)

## Contributing 💡

If you'd like to contribute to this project, feel free to fork it, make changes, and open a pull request! 

Any improvement, whether big or small, is welcome. 🌱

```
added python UI Interface
```



