// Added Project Feature 14.01.2026
// keep debug logs to prevent open issues on the repo just in case....
const express = require('express');
const puppeteer = require('puppeteer-core');
const { executablePath } = require('puppeteer');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const axios = require('axios');

const multer = require('multer');
const path = require('path');
const fs = require('fs');
let responseParts = [];
let currentDialogueContext = "";
let isDialogueActive = false;
let projectCreationInProgress = false;
let ACTION_SEQ = 0;

function trace(action, extra = {}) {
  ACTION_SEQ++;
  console.log(`🧭 [${ACTION_SEQ}] ${action}`, extra);
}



const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));
const YAML = require('yaml');      

const FORMAT_JSON = 'json';
const FORMAT_YAML = 'yaml';
const FORMAT_HTML = 'html';
const FORMAT_TXT  = 'txt';

const CONTENT_TYPE_JSON  = 'application/json';
const CONTENT_TYPE_YAML  = 'application/x-yaml';
const CONTENT_TYPE_HTML  = 'text/html';
const CONTENT_TYPE_PLAIN = 'text/plain';



const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

module.exports = upload;

const chatLogging = {
  enabled: false,
  format: 'json', // default format
  log: [],
  backupInterval: 10000, // every 10 seconds
  backupFile: path.join(__dirname, 'chatlogs', 'chatlog.backup.json')
};

function saveChatLog(log, format) {
  if (!log.length) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `chatlog-${timestamp}.${format}`;
  const filepath = path.join(__dirname, 'chatlogs', filename);

  fs.mkdirSync(path.dirname(filepath), { recursive: true });

  let content;

  switch(format) {
    case 'json':
      content = JSON.stringify(log, null, 2);
      break;
    case 'txt':
      content = log.map(entry => `Prompt: ${entry.prompt}\nResponse: ${entry.response}\n\n`).join('');
      break;
    case 'csv':
      content = 'Prompt,Response\n' + log.map(entry => {
         
        const p = `"${entry.prompt.replace(/"/g, '""')}"`;
        const r = `"${entry.response.replace(/"/g, '""')}"`;
        return `${p},${r}`;
      }).join('\n');
      break;
    default:
      content = JSON.stringify(log, null, 2);
  }

  fs.writeFileSync(filepath, content);
  console.log(`✅ Chat log saved to ${filepath}`);
}

setInterval(() => {
  if (!chatLogging.enabled || !chatLogging.log.length) return;

  try {
    fs.mkdirSync(path.dirname(chatLogging.backupFile), { recursive: true });
    fs.writeFileSync(chatLogging.backupFile, JSON.stringify(chatLogging.log, null, 2));
    console.log('💾 Chat log backup saved.');
  } catch (err) {
    console.error('❌ Failed to write chat log backup:', err);
  }
}, chatLogging.backupInterval);

app.use(cors());
app.use(bodyParser.json());

const SECRET_TOKEN = 'YOUR_SECRET_TOKEN_HERE';
let browser, page;
let loggedIn = false;
let webSearchEnabled = false;

async function launchBrowser() {
  console.log('Launching Puppeteer...');
  browser = await puppeteer.launch({
    headless: false,
    executablePath: executablePath(),
    args: ['--start-maximized'],
    defaultViewport: null,
  });

  page = await browser.newPage();
  await page.goto('https://lumo.proton.me/chat', { waitUntil: 'networkidle2' });

  console.log('Please log in manually to Proton Lumo in the opened browser.');

  const loginCheckInterval = setInterval(async () => {
    try {
      const dropdownSelector = 'button[data-testid="heading:userdropdown"]';
      const exists = await page.$(dropdownSelector);
      if (exists) {
        loggedIn = true;
        clearInterval(loginCheckInterval);
        console.log('✅ Login detected!');
      }
    } catch {}
  }, 2000);
}

const validateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (token !== `Bearer ${SECRET_TOKEN}`) {
    return res.status(403).send('Forbidden: Invalid token');
  }
  next();
};


async function cleanupProjectCreation(page) {
  try {
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent?.trim().toLowerCase() === 'cancel');

      if (cancelBtn) cancelBtn.click();

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      }));

      if (document.activeElement) {
        document.activeElement.blur();
      }
    });
  } catch (e) {
    console.warn('⚠️ Cleanup failed silently:', e.message);
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/create-project', validateToken, async (req, res) => {
  trace('CREATE_PROJECT: start');

  if (!loggedIn) {
    trace('CREATE_PROJECT: not logged in');
    return res.status(401).send('Please login first.');
  }

  if (projectCreationInProgress) {
    trace('CREATE_PROJECT: already in progress');
    return res.status(409).send('Project creation already in progress.');
  }

  const { projectName, projectInstructions } = req.body;

  if (!projectName) {
    trace('CREATE_PROJECT: missing projectName');
    return res.status(400).send('Project name is required.');
  }

  projectCreationInProgress = true;
  trace('CREATE_PROJECT: lock acquired');

  try {
    await page.bringToFront();
    trace('CREATE_PROJECT: page focused');

    const uiBefore = await page.evaluate(() => ({
      hasProjectModal: !!document.querySelector('#project-name'),
      hasCreatePlus: !!document.querySelector('button.projects-create-button'),
      hasSidebarBtn: !!document.querySelector('button[aria-label="Projects"]'),
      activeElement: document.activeElement?.tagName,
      url: location.href,
    }));
    trace('CREATE_PROJECT: ui before', uiBefore);

    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      }));
      document.activeElement?.blur();
    });
    trace('CREATE_PROJECT: cleanup sent (ESC + blur)');
    await sleep(200);

    const sidebarBtn = await page.$('button[aria-label="Projects"]');
    if (sidebarBtn) {
      trace('CREATE_PROJECT: sidebar collapsed → clicking');
      await sidebarBtn.click();
      await sleep(200);
    } else {
      trace('CREATE_PROJECT: sidebar already expanded');
    }

    trace('CREATE_PROJECT: waiting for + create button');
    await page.waitForSelector('button.projects-create-button', { timeout: 5000 });
    trace('CREATE_PROJECT: + create button found');

    await page.click('button.projects-create-button');
    trace('CREATE_PROJECT: + create clicked');

    trace('CREATE_PROJECT: waiting for modal inputs');
    await page.waitForSelector('#project-name', { timeout: 5000 });
    await page.waitForSelector('#project-instructions', { timeout: 5000 });
    trace('CREATE_PROJECT: modal ready');

    await page.evaluate(({ projectName, projectInstructions }) => {
      const setValue = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(el),
          'value'
        ).set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const name = document.querySelector('#project-name');
      const instructions = document.querySelector('#project-instructions');

      if (!name || !instructions) {
        throw new Error('Inputs missing inside modal');
      }

      setValue(name, projectName);
      setValue(instructions, projectInstructions || '');

      const createBtn = [...document.querySelectorAll('button')]
        .find(b => b.textContent.trim().toLowerCase() === 'create project');

      if (!createBtn) {
        throw new Error('Create Project button not found');
      }

      if (createBtn.disabled) {
        throw new Error('Create Project button disabled');
      }

      createBtn.click();
    }, { projectName, projectInstructions });

    trace('CREATE_PROJECT: create button clicked');

    await sleep(500);

    const uiAfter = await page.evaluate(() => ({
      hasProjectModal: !!document.querySelector('#project-name'),
      hasCreatePlus: !!document.querySelector('button.projects-create-button'),
      activeElement: document.activeElement?.tagName,
    }));
    trace('CREATE_PROJECT: ui after', uiAfter);

    projectCreationInProgress = false;
    trace('CREATE_PROJECT: lock released');

    res.send(`✅ Project "${projectName}" created successfully`);

  } catch (err) {
    projectCreationInProgress = false;
    trace('CREATE_PROJECT: error', { message: err.message });

    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      }));
    });

    console.error('❌ Error creating project:', err);
    res.status(500).send(`Failed to create project: ${err.message}`);
  }
});


app.post('/api/send-prompt', validateToken, async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');

  const { prompt } = req.body;
  if (!prompt) return res.status(400).send('Prompt is required.');

  try {
    console.log('🧭 SEND_PROMPT: start');

    await page.bringToFront();
    console.log('🧭 SEND_PROMPT: page focused');

    const inputSelectors = [
      'p[data-placeholder="Ask anything…"]',
      'div.ProseMirror'
    ];

    let selectorUsed = null;
    for (const selector of inputSelectors) {
      try {
        console.log('🧭 SEND_PROMPT: waiting for selector', selector);
        await page.waitForSelector(selector, { timeout: 8000 });
        selectorUsed = selector;
        break;
      } catch {}
    }

    if (!selectorUsed) {
      return res.status(500).send('Prompt input field not found.');
    }

    console.log('🧭 SEND_PROMPT: input found', selectorUsed);

    await page.evaluate(() => {
      const editor =
        document.querySelector('p[data-placeholder="Ask anything…"]') ||
        document.querySelector('div.ProseMirror');

      if (!editor) throw new Error('Editor not found');

      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);

      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      editor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    console.log('🧭 SEND_PROMPT: editor hard-focused');

    await page.evaluate(() => {
      if (document.activeElement?.tagName === 'BUTTON') {
        throw new Error('Active element is BUTTON — aborting send');
      }
    });

    await page.evaluate(() => {
      const editor = document.activeElement;
      if (editor) editor.textContent = '';
    });

    console.log('🧭 SEND_PROMPT: editor cleared');

    await page.keyboard.type(prompt, { delay: 20 });
    console.log('🧭 SEND_PROMPT: prompt typed');

    const previousResponse = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll('.assistant-msg-container'))
        .map(div => div.innerText.trim())
        .filter(Boolean);
      return blocks.length ? blocks[blocks.length - 1] : null;
    });

    console.log('🧭 SEND_PROMPT: previous response captured', {
      hasPrevious: !!previousResponse
    });

    await page.keyboard.press('Enter');
    console.log('🧭 SEND_PROMPT: enter pressed');

    let finalResponseText = null;

    try {
      const finalResponse = await page.waitForFunction(
        (prevText) => {
          const blocks = Array.from(document.querySelectorAll('.assistant-msg-container'))
            .map(div =>
              div.innerText
                .replace(/I like this response.*$/gis, '')
                .replace(/Report an issue.*$/gis, '')
                .replace(/Copy.*$/gis, '')
                .replace(/Regenerate.*$/gis, '')
                .trim()
            )
            .filter(Boolean);

          if (!blocks.length) return false;
          const last = blocks[blocks.length - 1];
          if (!last || last === prevText) return false;

          if (!window._stable) {
            window._stable = { text: last, time: Date.now() };
            return false;
          }

          if (window._stable.text !== last) {
            window._stable = { text: last, time: Date.now() };
            return false;
          }

          return Date.now() - window._stable.time > 2000 ? last : false;
        },
        { timeout: 50000 },
        previousResponse
      );

      finalResponseText = await finalResponse.jsonValue();
    } catch {
      console.warn('⏱️ SEND_PROMPT: response timeout');
    }

    if (!finalResponseText) {
      return res.send('Prompt sent, but response not detected.');
    }

    console.log('🧭 SEND_PROMPT: response received');

    res.send(finalResponseText);

  } catch (err) {
    console.error('❌ Error in /api/send-prompt:', err);
    res.status(500).send(`Waiting failed: ${err.message}`);
  }
});


app.post('/api/upload-file', validateToken, upload.array('files', 10), async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');
  try {
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).send('No files uploaded.');

    await page.bringToFront();
    const inputElement = await page.$('input[type="file"]');
    if (!inputElement) return res.status(500).send('Upload input not found on page.');

    const filePaths = files.map(f => f.path);
    await inputElement.uploadFile(...filePaths);

    await new Promise(resolve => setTimeout(resolve, 1000));

    res.send(`✅ ${files.length} file(s) uploaded successfully.`);
  } catch (err) {
    console.error('❌ Error uploading files:', err);
    res.status(500).send(`Failed to upload files: ${err.message}`);
  }
});


app.post('/api/open-project', validateToken, async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');
  const { projectName } = req.body;
  if (!projectName) return res.status(400).send('Project name is required.');

  try {
    await page.bringToFront();
    console.log('🧭 OPEN_PROJECT: page focused');

    const sidebarBtn = await page.$('button[aria-label="Projects"]');
    if (sidebarBtn) {
      console.log('🧭 OPEN_PROJECT: sidebar collapsed → clicking');
      await sidebarBtn.click();
      await sleep(200);
    } else {
      console.log('🧭 OPEN_PROJECT: sidebar already expanded');
    }

    const projectHandle = await page.evaluateHandle((name) => {
      const link = Array.from(document.querySelectorAll('a.project-sidebar-item span[title]'))
        .find(el => el.title === name);
      return link?.parentElement || null;
    }, projectName);

    if (!projectHandle) {
      return res.status(404).send(`❌ Project "${projectName}" not found`);
    }

    await projectHandle.click();
    console.log(`🧭 OPEN_PROJECT: Project "${projectName}" clicked`);
    await sleep(300);

    res.send(`✅ Project "${projectName}" opened successfully`);
  } catch (err) {
    console.error('❌ Error opening project:', err);
    res.status(500).send(`Failed to open project: ${err.message}`);
  }
});



app.post('/api/set-websearch', validateToken, async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).send('Invalid "enabled" value');

  try {
    await page.bringToFront();
    const result = await page.evaluate((shouldEnable) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const webSearchButton = buttons.find(btn => btn.innerText.trim() === 'Web search');
      if (!webSearchButton) return { success: false, reason: 'Web search button not found' };
      const isActive = webSearchButton.classList.contains('is-active');
      if (isActive !== shouldEnable) {
        webSearchButton.click();
        return { success: true, toggled: true };
      }
      return { success: true, toggled: false };
    }, enabled);

    if (!result.success) {
      return res.status(500).send(`Failed to toggle web search: ${result.reason}`);
    }

    webSearchEnabled = enabled;
    res.send(`Web search ${enabled ? 'enabled' : 'disabled'}.`);
  } catch (err) {
    console.error('❌ Error toggling web search:', err);
    res.status(500).send(`Failed to toggle web search: ${err.message}`);
  }
});

app.post('/api/set-ghostmode', validateToken, async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');

  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).send('Invalid "enabled" value');

  try {
    await page.bringToFront();

    if (enabled) {
      const result = await page.evaluate(() => {
        const paths = Array.from(document.querySelectorAll('path'));
        const disabledGhostIcon = 'M14.7497 9.25362L15.4433 9.50118L18.0931 7.79902';
        const enabledGhostIcon = 'M17.0185 11.5867C17.7224 11.6254';

        const ghostPath = paths.find(p =>
          p.outerHTML.includes(disabledGhostIcon) || p.outerHTML.includes(enabledGhostIcon)
        );
        if (!ghostPath) return { success: false, reason: 'Ghost icon not found' };

        const ghostButton = ghostPath.closest('button');
        if (!ghostButton) return { success: false, reason: 'Ghost button not found' };

        const isEnabled = ghostPath.outerHTML.includes(enabledGhostIcon);
        return {
          success: true,
          isEnabled,
          selector: ghostButton.getAttribute('data-testid') || ghostButton.outerHTML
        };
      });

      if (!result.success) {
        return res.status(500).send(`Failed to find ghost mode button: ${result.reason}`);
      }

      if (!result.isEnabled) {
        try {
          let buttonSelector = null;
          if (result.selector && typeof result.selector === 'string' && !result.selector.startsWith('<')) {
            buttonSelector = `[data-testid="${result.selector}"]`;
          }

          if (buttonSelector) {
            await page.waitForSelector(buttonSelector, { visible: true, timeout: 3000 });
            await new Promise(resolve => setTimeout(resolve, 100));
            await page.click(buttonSelector, { delay: 50 });
          } else {
            await page.evaluate(() => {
              const disabledGhostIcon = 'M14.7497 9.25362L15.4433 9.50118L18.0931 7.79902';
              const enabledGhostIcon = 'M17.0185 11.5867C17.7224 11.6254';
              const paths = Array.from(document.querySelectorAll('path'));
              const ghostPath = paths.find(p =>
                p.outerHTML.includes(disabledGhostIcon) || p.outerHTML.includes(enabledGhostIcon)
              );
              const ghostButton = ghostPath?.closest('button');
              if (ghostButton) ghostButton.click();
            });
          }

          await new Promise(resolve => setTimeout(resolve, 300));

          const verifyEnabled = await page.evaluate(() => {
            const paths = Array.from(document.querySelectorAll('path'));
            const enabledGhostIcon = 'M17.0185 11.5867C17.7224 11.6254';
            const ghostPath = paths.find(p => p.outerHTML.includes(enabledGhostIcon));
            return !!ghostPath;
          });

          if (!verifyEnabled) {
            return res.status(500).send(`Tried to enable ghost mode, but it's still disabled.`);
          }
        } catch (err) {
          console.error('❌ Error enabling ghost mode:', err);
          return res.status(500).send(`Failed to enable ghost mode: ${err.message}`);
        }
      }

      return res.send(`Ghost mode enabled 🕵️‍♂️ .`);
    }

    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button.button-for-icon.button-medium.button-solid-norm'));
        const newChatBtn = buttons.find(btn => btn.textContent?.trim().toLowerCase() === 'new chat');
        if (newChatBtn) newChatBtn.click();
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      const ghostModeDisabled = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll('path'));
      const enabledGhostIcon = 'M17.0185 11.5867C17.7224 11.6254';
      const disabledGhostIcon = 'M14.7497 9.25362L15.4433 9.50118L18.0931 7.79902';
      const hasEnabled = paths.some(p => p.outerHTML.includes(enabledGhostIcon));
      const hasDisabled = paths.some(p => p.outerHTML.includes(disabledGhostIcon));
      return !hasEnabled && !hasDisabled;
      });



      if (!ghostModeDisabled) {
        return res.send('Ghost mode disabled 👻 (verified via "New chat").');

      }

      return res.send(`Ghost mode disabled 👻 (via "New chat").`);
    } catch (err) {
      console.error('❌ Error disabling ghost mode:', err);
      return res.status(500).send(`Failed to disable ghost mode: ${err.message}`);
    }

  } catch (err) {
    console.error('❌ Error toggling ghost mode:', err);
    res.status(500).send(`Failed to toggle ghost mode: ${err.message}`);
  }
});



app.post('/api/start-new-chat', validateToken, async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');

  try {
    await page.bringToFront();

    const result = await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll('span.sidebar-item-label'))
        .find(s => s.textContent?.trim().toLowerCase() === 'new chat');

      if (!span) return false;

      const clickable = span.closest('button, div[role="button"]');
      if (clickable) {
        clickable.click();
        return true;
      }
      return false;
    });

    if (!result) {
      return res.status(500).send('❌ Failed to find or click the "New chat" button inside project.');
    }

    await new Promise(resolve => setTimeout(resolve, 300));
    res.send('✅ New chat started successfully.');

  } catch (err) {
    console.error('❌ Error starting new chat:', err);
    res.status(500).send(`Failed to start new chat: ${err.message}`);
  }
});

/* old function let it just in case

/*app.post('/api/start-new-chat', validateToken, async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');

  try {
    // === Save logged conversation if logging is enabled ===
    if (chatLogging?.enabled && chatLogging.log.length > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filenameBase = `chatlog_${timestamp}`;
      const saveDir = path.join(__dirname, 'chatlogs');

      if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir);

      const fullPath = (ext) => path.join(saveDir, `${filenameBase}.${ext}`);

      if (chatLogging.format === 'txt') {
        const textContent = chatLogging.log.map(
          pair => `You: ${pair.prompt}\nLumo: ${pair.response}`
        ).join('\n\n');
        fs.writeFileSync(fullPath('txt'), textContent, 'utf8');

      } else if (chatLogging.format === 'csv') {
        const header = `"prompt","response"\n`;
        const rows = chatLogging.log.map(
          pair => `"${pair.prompt.replace(/"/g, '""')}","${pair.response.replace(/"/g, '""')}"`
        ).join('\n');
        fs.writeFileSync(fullPath('csv'), header + rows, 'utf8');

      } else {
        // default to json
        fs.writeFileSync(fullPath('json'), JSON.stringify(chatLogging.log, null, 2), 'utf8');
      }

      // Clear the log after saving
      chatLogging.log = [];
    }

    // === Start New Chat as normal ===
    await page.bringToFront();

    const result = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button.button-for-icon.button-medium.button-solid-norm'));
      const newChatBtn = buttons.find(btn => btn.textContent?.trim().toLowerCase() === 'new chat');
      if (newChatBtn) {
        newChatBtn.click();
        return true;
      }
      return false;
    });

    if (!result) {
      return res.status(500).send('❌ Failed to find or click the "New chat" button.');
    }

    await new Promise(resolve => setTimeout(resolve, 300));
    res.send('✅ New chat started successfully.');
  } catch (err) {
    console.error('❌ Error starting new chat:', err);
    res.status(500).send(`Failed to start new chat: ${err.message}`);
  }
});
*/


app.post('/api/upload-file', validateToken, upload.array('files', 10), async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');

  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).send('No files uploaded.');
    }

    console.log('📦 Uploading files:');
    for (const file of files) {
      console.log({
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        tempPath: file.path,
      });
    }

    
    await page.bringToFront();

    const inputElement = await page.$('input[type="file"]');
    if (!inputElement) {
      console.error('❌ File input element not found on page.');
      return res.status(500).send('Upload input not found on page.');
    }

    const filePaths = files.map((f) => f.path);

    await inputElement.uploadFile(...filePaths);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    res.send(`✅ ${files.length} file(s) uploaded successfully.`);
  } catch (err) {
    console.error('❌ Error uploading files:', err);
    res.status(500).send(`Failed to upload files: ${err.message}`);
  }
});


app.post('/api/send-prompt', validateToken, async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');
  const { prompt } = req.body;
  if (!prompt) return res.status(400).send('Prompt is required.');

  try {
    await page.bringToFront();

    const inputSelectors = ['p[data-placeholder="Ask anything…"]', 'div.ProseMirror'];
    let inputHandle = null;

    for (const selector of inputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 8000 }); 
        inputHandle = await page.$(selector);
        if (inputHandle) break;
      } catch {
        continue;
      }
    }

    if (!inputHandle) return res.status(500).send('Prompt input field not found.');

    await inputHandle.focus();
    await page.evaluate(() => {
      const inputElem = document.activeElement;
      if (inputElem) inputElem.textContent = '';
    });
    await page.keyboard.type(prompt, { delay: 20 });
    await page.keyboard.press('Enter');

    const previousResponse = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll('.assistant-msg-container'))
        .map(div => div.innerText.trim()
          .replace(/I like this response.*$/gis, '')
          .replace(/Report an issue.*$/gis, '')
          .replace(/Copy.*$/gis, '')
          .replace(/Regenerate.*$/gis, '')
          .trim())
        .filter(text => text.length > 0);
      return blocks.length ? blocks[blocks.length - 1] : null;
    });

    let finalResponseText = null;

    try {
      const finalResponse = await page.waitForFunction(
        (prevText) => {
          const blocks = Array.from(document.querySelectorAll('.assistant-msg-container'))
            .map(div => div.innerText.trim()
              .replace(/I like this response.*$/gis, '')
              .replace(/Report an issue.*$/gis, '')
              .replace(/Copy.*$/gis, '')
              .replace(/Regenerate.*$/gis, '')
              .trim())
            .filter(text => text.length > 0);
          if (!blocks.length) return false;
          const last = blocks[blocks.length - 1];
          if (!last || last === prevText) return false;
          if (!window._prevContent) {
            window._prevContent = { text: last, time: Date.now() };
            return false;
          }
          if (window._prevContent.text !== last) {
            window._prevContent = { text: last, time: Date.now() };
            return false;
          }
          const elapsed = Date.now() - window._prevContent.time;
          return elapsed > 2000 ? last : false;
        },
        { timeout: 50000 }, 
        previousResponse
      );

      finalResponseText = await finalResponse.jsonValue();
    } catch (timeoutErr) {
      console.warn('⏱️ Lumo response timed out');
      finalResponseText = null;
    }

    if (chatLogging?.enabled && finalResponseText) {
      chatLogging.log.push({ prompt, response: finalResponseText });
    }

    if (!finalResponseText) {
      return res.send('Prompt sent, but response not detected.');
    }

    res.send(finalResponseText);

  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).send(`Waiting failed: ${err.message}`);
  }
});



async function clickFirstRemoveButton(page) {
  try {
    await page.waitForSelector('[data-testid="remove-button"]', { timeout: 5000 });

    const fileCard = await page.$('[data-testid="remove-button"]');

    if (!fileCard) throw new Error('Remove button not found.');

    const parentCard = await fileCard.evaluateHandle(el => el.closest('div'));

    const box = await parentCard.boundingBox();
    if (!box) throw new Error('Could not determine bounding box of file card.');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await new Promise(resolve => setTimeout(resolve, 400));

    const btnBox = await fileCard.boundingBox();
    if (!btnBox) throw new Error('Remove button is not visible yet');

    await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);

    console.log('✅ File removed!');
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (err) {
    console.error('❌ Error in clickFirstRemoveButton:', err.message);
  }
}


async function clickAllRemoveButtons(page) {
  try {
    while (true) {
      const removeButtons = await page.$$('[data-testid="remove-button"]');
      if (removeButtons.length === 0) {
        console.log('✅ No more files to remove.');
        break;
      }
      console.log(`🧹 Removing ${removeButtons.length} file(s)...`);
      await clickFirstRemoveButton(page);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error('❌ Error in clickAllRemoveButtons:', err.message);
  }
}


app.post('/api/remove-file', validateToken, async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');

  const { mode } = req.body;
  if (!['single', 'all'].includes(mode)) {
    return res.status(400).send('Invalid mode. Use "single" or "all".');
  }

  try {
    await page.bringToFront();
    if (mode === 'single') {
      await clickFirstRemoveButton(page);
      return res.send('🗑️ Removed one file.');
    } else if (mode === 'all') {
      await clickAllRemoveButtons(page);
      return res.send('🧹 All files removed.');
    }
  } catch (err) {
    console.error('❌ Error in /api/remove-file:', err.message);
    res.status(500).send(`Failed to remove files: ${err.message}`);
  }
});


app.post('/api/set-save-chat', validateToken, (req, res) => {
  const { enabled, format } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).send('Missing or invalid "enabled" value (must be true or false).');
  }

  const supportedFormats = ['json', 'txt', 'csv'];
  const chosenFormat = (format || 'json').toLowerCase();

  if (!supportedFormats.includes(chosenFormat)) {
    return res.status(400).send(`Invalid format. Supported formats: ${supportedFormats.join(', ')}`);
  }

  chatLogging.enabled = enabled;
  chatLogging.format = chosenFormat;

  if (enabled) {
    chatLogging.log = [];
  }

  res.send(`✅ Chat logging ${enabled ? 'enabled' : 'disabled'} using format: ${chosenFormat}`);
});


app.post('/api/send-hacker-message', validateToken, async (req, res) => {
  const { url } = req.body;

  if (!url || !url.includes('apikey=')) {
    return res.status(400).send('Missing or invalid API URL with apikey');
  }

  const formatMatch = url.match(/format=(json|yaml|html|txt)/i);
  const format = formatMatch ? formatMatch[1].toLowerCase() : FORMAT_JSON;

  const acceptHeaderMap = {
    [FORMAT_JSON]: CONTENT_TYPE_JSON,
    [FORMAT_YAML]: CONTENT_TYPE_YAML,
    [FORMAT_HTML]: CONTENT_TYPE_HTML,
    [FORMAT_TXT]: CONTENT_TYPE_PLAIN,
  };
  const acceptHeader = acceptHeaderMap[format] || CONTENT_TYPE_JSON;

  try {
    const response = await fetch(url, { headers: { Accept: acceptHeader } });
    const contentTypeRaw = (response.headers.get('content-type') || '').toLowerCase();

    let parsedData;
    let rawText = '';

    if (contentTypeRaw.includes(CONTENT_TYPE_JSON) || format === FORMAT_JSON) {
      parsedData = await response.json();
    } else {
      rawText = await response.text();

      if (contentTypeRaw.includes(CONTENT_TYPE_YAML) || format === FORMAT_YAML) {
        try {
          parsedData = YAML.parse(rawText);
        } catch {
          parsedData = { message: rawText };
        }
      } else if (contentTypeRaw.includes(CONTENT_TYPE_HTML) || format === FORMAT_HTML) {
        parsedData = { message: rawText.replace(/<\/?[^>]+(>|$)/g, '') };
      } else if (format === FORMAT_TXT || contentTypeRaw.includes(CONTENT_TYPE_PLAIN)) {
        parsedData = { message: rawText };
      } else {
        parsedData = { message: rawText };
      }
    }

    const message = typeof parsedData === 'object'
      ? Object.values(parsedData).find(val => typeof val === 'string' && val.trim()) || 'No message found.'
      : String(parsedData);

    const cleanedMessage = message
      .replace(/I like this response.*$/gis, '')
      .replace(/Report an issue.*$/gis, '')
      .replace(/Copy.*$/gis, '')
      .replace(/Regenerate.*$/gis, '')
      .trim();

    const sendToLumo = async (prompt) => {
      await page.bringToFront();
      const inputSelectors = ['p[data-placeholder="Ask anything…"]', 'div.ProseMirror'];
      let inputHandle = null;

      for (const selector of inputSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 8000 }); 
          inputHandle = await page.$(selector);
          if (inputHandle) break;
        } catch {}
      }

      if (!inputHandle) throw new Error('Lumo input field not found.');

      await inputHandle.focus();
      await page.evaluate(() => {
        const el = document.activeElement;
        if (el) el.textContent = '';
      });
      await page.keyboard.type(prompt, { delay: 20 });
      await page.keyboard.press('Enter');

      const previousResponse = await page.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll('.assistant-msg-container'))
          .map(div => div.innerText.trim()
            .replace(/I like this response.*$/gis, '')
            .replace(/Report an issue.*$/gis, '')
            .replace(/Copy.*$/gis, '')
            .replace(/Regenerate.*$/gis, '')
            .trim())
          .filter(text => text.length > 0);
        return blocks.length ? blocks[blocks.length - 1] : null;
      });

      let finalResponseText = null;

      try {
        const finalResponse = await page.waitForFunction(
          (prevText) => {
            const blocks = Array.from(document.querySelectorAll('.assistant-msg-container'))
              .map(div => div.innerText.trim()
                .replace(/I like this response.*$/gis, '')
                .replace(/Report an issue.*$/gis, '')
                .replace(/Copy.*$/gis, '')
                .replace(/Regenerate.*$/gis, '')
                .trim())
              .filter(text => text.length > 0);
            if (!blocks.length) return false;
            const last = blocks[blocks.length - 1];
            if (!last || last === prevText) return false;
            if (!window._prevContent) {
              window._prevContent = { text: last, time: Date.now() };
              return false;
            }
            if (window._prevContent.text !== last) {
              window._prevContent = { text: last, time: Date.now() };
              return false;
            }
            const elapsed = Date.now() - window._prevContent.time;
            return elapsed > 2000 ? last : false;
          },
          { timeout: 50000 }, 
          previousResponse
        );
        finalResponseText = await finalResponse.jsonValue();
      } catch {
        console.warn('⏱️ Lumo response timed out');
        finalResponseText = null;
      }

      return finalResponseText;
    };

    const lumoResponse = await sendToLumo(cleanedMessage);

    const output = ` 🛰️ Hacker API message sent: ${cleanedMessage}  🤖 Lumo API responded: ${lumoResponse || 'No response detected'} `.trim();

    res.type('text/plain').send(output);

  } catch (err) {
    console.error('❌ Error in send-hacker-prompt:', err);
    res.status(500).send('Proxy Error: ' + err.message);
  }
});


app.post('/api/send-automated-dialogue', validateToken, async (req, res) => {
  if (!loggedIn) return res.status(401).send('Please login first.');
  const { initialPrompt, maxTurns = 30 } = req.body;
  if (!initialPrompt) return res.status(400).send('Initial prompt is required.');

  try {
    responseParts = [];
    currentDialogueContext = "";
    isDialogueActive = true;

    const extractKeywords = (text) => {
      const stopWords = new Set(['the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'it', 'that', 'this', 'these', 'those', 'be', 'by', 'as', 'are', 'has', 'have', 'had']);
      const words = text.toLowerCase().split(/\s+/)
        .map(word => word.replace(/[^\w\s]/g, ''))
        .filter(word => word.length > 2 && !stopWords.has(word));

      const wordCount = {};
      words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
      });

      return Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);
    };

    const categorizeTopic = (keywords) => {
      const topicCategories = {
        'weather': ['weather', 'temperature', 'forecast', 'rain', 'snow', 'storm'],
        'travel': ['zurich', 'city', 'location', 'visit', 'tourist', 'travel', 'destination'],
        'technology': ['computer', 'software', 'hardware', 'code', 'programming', 'algorithm'],
        'science': ['research', 'study', 'experiment', 'discovery', 'scientific', 'data'],
        'history': ['historical', 'past', 'event', 'war', 'revolution', 'period'],
        'culture': ['art', 'music', 'film', 'literature', 'tradition', 'custom'],
        'health': ['medical', 'doctor', 'hospital', 'disease', 'treatment', 'health'],
        'food': ['restaurant', 'cooking', 'recipe', 'dish', 'cuisine', 'meal']
      };

      for (const [category, keywordsList] of Object.entries(topicCategories)) {
        if (keywords.some(keyword => keywordsList.includes(keyword))) {
          return category;
        }
      }

      return 'general';
    };

    const generateFollowUpPrompt = (turnNumber, currentTopic) => {
      const lastResponse = responseParts[responseParts.length - 1];
      const keywords = extractKeywords(lastResponse);
      const currentKeywords = keywords.slice(0, 2);

      const shouldTransition = turnNumber % 4 === 0 ||
                              (turnNumber > 5 && Math.random() > 0.7) ||
                              (lastResponse.split(/\s+/).length < 15 && turnNumber > 3);

      if (shouldTransition) {
        const topicTransitions = {
          'weather': [
            `Speaking of ${currentKeywords[0]}, do you have any favorite ${['books', 'movies', 'places'][Math.floor(Math.random() * 3)]} related to this?`,
            `Does ${currentKeywords[0]} remind you of any interesting ${['stories', 'experiences', 'events'][Math.floor(Math.random() * 3)]}?`,
            `What's something completely different that you find fascinating?`
          ],
          'travel': [
            `Besides ${currentKeywords[0]}, what other destinations interest you?`,
            `Do you have any hobbies unrelated to travel?`,
            `What's a fascinating fact about something completely different?`
          ],
          'technology': [
            `Beyond technology, what other fields interest you?`,
            `What's something in nature that amazes you?`,
            `Do you have any favorite ${['books', 'movies', 'art forms'][Math.floor(Math.random() * 3)]}?`
          ],
          'science': [
            `Outside of science, what captures your attention?`,
            `What's a historical event that you find intriguing?`,
            `Do you enjoy any creative activities like ${['writing', 'painting', 'music'][Math.floor(Math.random() * 3)]}?`
          ],
          'history': [
            `Moving beyond history, what modern topics interest you?`,
            `What's something in the natural world that fascinates you?`,
            `Do you have any favorite ${['novels', 'films', 'artworks'][Math.floor(Math.random() * 3)]}?`
          ],
          'culture': [
            `Beyond cultural topics, what else do you enjoy learning about?`,
            `What scientific discoveries do you find most interesting?`,
            `Do you have any favorite places to visit or explore?`
          ],
          'health': [
            `Outside of health topics, what other subjects interest you?`,
            `What technological advancements do you find most exciting?`,
            `Do you have any favorite ${['books', 'movies', 'hobbies'][Math.floor(Math.random() * 3)]}?`
          ],
          'food': [
            `Beyond food, what other topics do you enjoy discussing?`,
            `What's something in nature that you find fascinating?`,
            `Do you have any favorite ${['historical', 'scientific', 'cultural'][Math.floor(Math.random() * 3)]} topics?`
          ],
          'general': [
            `What's something completely different you'd like to talk about?`,
            `Do you have any favorite ${['books', 'movies', 'hobbies'][Math.floor(Math.random() * 3)]}?`,
            `What's a fascinating fact about something unexpected?`
          ]
        };

        const transitionPrompts = topicTransitions[currentTopic] || topicTransitions['general'];
        return transitionPrompts[Math.floor(Math.random() * transitionPrompts.length)];
      } else {
        const topicSpecificPrompts = {
          'weather': [
            `What factors contribute to the ${currentKeywords[0]} patterns in this region?`,
            `How does ${currentKeywords[0]} affect daily life here?`,
            `Are there any interesting ${currentKeywords[0]}-related phenomena?`
          ],
          'travel': [
            `What makes ${currentKeywords[0]} special compared to other places?`,
            `What are some hidden gems in or near ${currentKeywords[0]}?`,
            `How has ${currentKeywords[0]} changed over time?`
          ],
          'technology': [
            `What are the latest developments in ${currentKeywords[0]}?`,
            `How is ${currentKeywords[0]} impacting other industries?`,
            `What challenges does ${currentKeywords[0]} currently face?`
          ],
          'science': [
            `What recent ${currentKeywords[0]} discoveries excite you?`,
            `How does ${currentKeywords[0]} research benefit society?`,
            `What are the biggest questions in ${currentKeywords[0]} today?`
          ],
          'history': [
            `What lesser-known ${currentKeywords[0]} events are interesting?`,
            `How does ${currentKeywords[0]} shape our present?`,
            `What can we learn from ${currentKeywords[0]}?`
          ],
          'culture': [
            `What unique ${currentKeywords[0]} traditions exist?`,
            `How has ${currentKeywords[0]} evolved over time?`,
            `What are some famous figures in ${currentKeywords[0]}?`
          ],
          'health': [
            `What are the latest ${currentKeywords[0]} breakthroughs?`,
            `How can we improve ${currentKeywords[0]} awareness?`,
            `What are common misconceptions about ${currentKeywords[0]}?`
          ],
          'food': [
            `What traditional ${currentKeywords[0]} dishes are popular?`,
            `How has ${currentKeywords[0]} culture influenced other cuisines?`,
            `What are some unique ${currentKeywords[0]} ingredients?`
          ],
          'general': [
            `Could you tell me more about that?`,
            `What are the key aspects of this topic?`,
            `How does this connect to other areas?`
          ]
        };

        const specificPrompts = topicSpecificPrompts[currentTopic] || topicSpecificPrompts['general'];
        return specificPrompts[Math.floor(Math.random() * specificPrompts.length)];
      }
    };

    const sendSinglePrompt = async (prompt) => {
      await page.bringToFront();
      const inputSelectors = [
        'p[data-placeholder="Ask anything\\n"]',
        'div.ProseMirror'
      ];
      let inputHandle = null;

      for (const selector of inputSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 10000 });
          inputHandle = await page.$(selector);
          if (inputHandle) break;
        } catch (error) {
          console.error(`Error selecting input with selector ${selector}:`, error);
        }
      }

      if (!inputHandle) throw new Error('Prompt input field not found.');

      await inputHandle.focus();
      await page.evaluate(() => {
        const inputElem = document.activeElement;
        if (inputElem) inputElem.textContent = '';
      });

      console.log("Sending prompt:", prompt);
      await page.keyboard.type(prompt, { delay: 20 });
      await page.keyboard.press('Enter');

      const previousResponse = await page.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll('.assistant-msg-container'))
          .map(div => div.innerText.trim()
            .replace(/I like this response.*$/gis, '')
            .replace(/Report an issue.*$/gis, '')
            .replace(/Copy.*$/gis, '')
            .replace(/Regenerate.*$/gis, '')
            .trim()
          )
          .filter(text => text.length > 0);
        return blocks.length ? blocks[blocks.length - 1] : null;
      });

      const finalResponse = await page.waitForFunction(
        (prevText) => {
          const blocks = Array.from(document.querySelectorAll('.assistant-msg-container'))
            .map(div => div.innerText.trim()
              .replace(/I like this response.*$/gis, '')
              .replace(/Report an issue.*$/gis, '')
              .replace(/Copy.*$/gis, '')
              .replace(/Regenerate.*$/gis, '')
              .trim()
            )
            .filter(text => text.length > 0);
          if (!blocks.length) return false;
          const last = blocks[blocks.length - 1];
          if (!last || last === prevText) return false;
          if (!window._prevContent) {
            window._prevContent = { text: last, time: Date.now() };
            return false;
          }
          if (window._prevContent.text !== last) {
            window._prevContent = { text: last, time: Date.now() };
            return false;
          }
          const elapsed = Date.now() - window._prevContent.time;
          return elapsed > 30000 ? last : false; 
        },
        { timeout: 20000 }, 
        previousResponse
      );

      const responseText = await finalResponse.jsonValue();

      if (!responseText) throw new Error('No response received from Lumo');

      currentDialogueContext = responseText;
      responseParts.push(responseText);

      return responseText;
    };

    const dialogueResponses = {
      initialPrompt,
      responses: []
    };

    let currentTopic = 'general';
    const initialResponse = await sendSinglePrompt(initialPrompt);
    dialogueResponses.responses.push({
      turn: 1,
      prompt: initialPrompt,
      response: initialResponse
    });

    const initialKeywords = extractKeywords(initialResponse);
    currentTopic = categorizeTopic(initialKeywords);

    let turnNumber = 2;
    while (isDialogueActive && turnNumber <= maxTurns) {
      const followUpPrompt = generateFollowUpPrompt(turnNumber, currentTopic);

      console.log(`Turn ${turnNumber}: Generated follow-up prompt:`, followUpPrompt);

      try {
        const followUpResponse = await sendSinglePrompt(followUpPrompt);
        dialogueResponses.responses.push({
          turn: turnNumber,
          prompt: followUpPrompt,
          response: followUpResponse
        });

        const newKeywords = extractKeywords(followUpResponse);
        const newTopic = categorizeTopic(newKeywords);
        if (newTopic !== currentTopic) {
          currentTopic = newTopic;
          console.log(`Topic transitioned to: ${currentTopic}`);
        }

        turnNumber++;

        if (turnNumber > maxTurns) {
          console.log(`Reached maximum turns (${maxTurns})`);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error during turn ${turnNumber}:`, error);
        turnNumber++;
      }
    }

    if (chatLogging?.enabled) {
      chatLogging.log.push({
        type: "dialogue",
        initialPrompt,
        responses: dialogueResponses.responses
      });
    }

    res.json({
      dialogue: dialogueResponses,
      suggestion: "Consider enabling Web Search for more accurate and detailed responses",
      completedTurns: turnNumber - 1,
      maxTurns: maxTurns,
      status: "completed",
      finalTopic: currentTopic
    });

  } catch (err) {
    isDialogueActive = false;
    console.error('Error in automated dialogue:', err);
    res.status(500).send(`Dialogue error: ${err.message}`);
  } finally {
    isDialogueActive = false;
  }
});



app.get('/api/help', (req, res) => {
  const helpText = `
=== CURL COMMANDS FOR LUMO API ===

➤ Sending a Prompt to Lumo
curl -X POST http://localhost:3000/api/send-prompt \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "What is the weather in Zurich?"}'

➤ Enabling Web Search
curl -X POST http://localhost:3000/api/set-websearch \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"enabled": true}'

➤ Disabling Web Search
curl -X POST http://localhost:3000/api/set-websearch \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"enabled": false}'

➤ Enabling Ghost Mode
curl -X POST http://localhost:3000/api/set-ghostmode \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"enabled": true}'

➤ Disabling Ghost Mode
curl -X POST http://localhost:3000/api/set-ghostmode \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"enabled": false}'

➤ Start New Chat
curl -X POST http://localhost:3000/api/start-new-chat \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -H "Content-Type: application/json"

➤ Upload Files (max 10, or depending on Lumo limits)
curl -X POST http://localhost:3000/api/upload-file \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -F "files=@./test.html" \\
  -F "files=@./test2.txt" \\
  -F "files=@./test3.txt"

➤ Upload a Single File
curl -X POST http://localhost:3000/api/upload-file \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -F "files=@./test.html"

➤ Delete All Files
curl -X POST http://localhost:3000/api/remove-file \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"mode":"all"}'

➤ Delete a Single File
curl -X POST http://localhost:3000/api/remove-file \\
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"mode":"single"}'

  
➤ Envolving Function
curl -X POST http://localhost:3000/api/send-automated-dialogue \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"initialPrompt": "what is proton lumo", "maxTurns": 30}'
  

➤ Call to Hmas Api // read the api docs for more commands
➤ Proxy a request to Hmas API and send the response to Lumo
➤ Please note that the api key will be disabled soon
➤ To keep using this feauture consider to buy a api key 
curl -X POST http://localhost:3000/api/send-hacker-message \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://carlostkd.ch/hmas/api.php?as=admin&format=html&apikey=testkey123"}'
  `;


  res.type('text/plain').send(helpText);
});


app.listen(3000, async () => {
  await launchBrowser();
  console.log('🚀 Server listening on http://localhost:3000');
});
