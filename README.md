# AI Form Agent Widget

A drop-in AI assistant that helps users fill out forms through natural conversation. The widget uses OpenAI to intelligently collect form data and submits it to your existing API endpoints.

## Architecture

The system consists of three main components:

1. **Widget (Frontend)** - A JavaScript widget that embeds in any website
2. **Backend API** - Node.js/Express server that handles OpenAI chat completions
3. **Static Config** - JSON files that define form structure and behavior

### How It Works

1. Publisher embeds the widget on their page
2. Widget loads a static config from the publisher's domain
3. User chats with the AI assistant to fill out the form
4. Widget sends messages to your backend API
5. Backend uses OpenAI to understand and collect form data
6. When complete, widget submits to publisher's API using their session

## Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

Start the backend:

```bash
npm start
```

The backend will run on `http://localhost:3000`

### 2. Widget Integration

Add to your HTML page:

```html
<!-- Mount point for the widget -->
<div id="ai-agent"></div>

<!-- Load the widget -->
<script
  src="https://cdn.youragent.com/widget.js"
  data-config="/ai-config/contact.json"
  data-site-key="SITE_ABC_123"
  data-backend-url="https://api.youragent.com"
></script>
```

**Attributes:**
- `data-config` - Path to your static config file (on your domain)
- `data-site-key` - Unique identifier for your site
- `data-backend-url` - URL of the backend API (optional, defaults to `http://localhost:3000`)

### 3. Create a Config File

Create a JSON file at the path specified in `data-config`:

```json
{
  "name": "Contact Form",
  "description": "Collects a contact request",
  "form": {
    "submitTo": "/api/contact",
    "method": "POST"
  },
  "fields": {
    "name": {
      "label": "Full name",
      "type": "string",
      "prompt": "What is your full name?",
      "required": true
    },
    "email": {
      "label": "Email",
      "type": "string",
      "prompt": "What is your email address?",
      "required": true,
      "validation": {
        "pattern": ".+@.+"
      }
    },
    "message": {
      "label": "Message",
      "type": "string",
      "prompt": "What message do you want to send?",
      "required": false
    }
  },
  "ui": {
    "greeting": "Hi! I can fill this form for you."
  }
}
```

## Config Format

### Root Properties

- `name` (string) - Display name of the form
- `description` (string) - Brief description of the form's purpose
- `form` (object) - Form submission configuration
  - `submitTo` (string) - API endpoint to submit the collected data
  - `method` (string) - HTTP method (default: "POST")
- `fields` (object) - Field definitions (see below)
- `ui` (object) - UI customization
  - `greeting` (string) - Initial message from the assistant

### Field Properties

Each field in the `fields` object can have:

- `label` (string) - Human-readable field name
- `type` (string) - Data type (currently "string")
- `prompt` (string) - Question to ask the user
- `required` (boolean) - Whether the field is required
- `validation` (object) - Validation rules
  - `pattern` (string) - Regex pattern for validation

## Backend API

### POST /llm

Processes chat messages and returns AI responses.

**Request:**

```json
{
  "siteKey": "SITE_ABC_123",
  "formConfig": { /* config object */ },
  "messages": [
    { "role": "system", "content": "You are a form-filling assistant." },
    { "role": "user", "content": "Hi" }
  ]
}
```

**Response (incomplete):**

```json
{
  "reply": "Great, what's your email?",
  "status": "incomplete",
  "collected": {
    "name": "John Doe"
  }
}
```

**Response (complete):**

```json
{
  "reply": "Thanks, I'll submit that now.",
  "status": "complete",
  "collected": {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Hello"
  },
  "submitTo": "/api/contact"
}
```

### GET /health

Health check endpoint.

**Response:**

```json
{
  "status": "ok"
}
```

## Testing Locally

1. Start the backend:
   ```bash
   cd backend
   npm start
   ```

2. Serve the example page:
   ```bash
   cd examples
   python3 -m http.server 8080
   ```

3. Open `http://localhost:8080` in your browser

4. Chat with the AI to fill out the form

The example page includes a mock API endpoint that logs submissions to the console.

## Security Considerations

### CORS

The backend uses CORS to allow requests from any origin. In production, you should restrict this to specific domains:

```javascript
app.use(cors({
  origin: ['https://yoursite.com', 'https://www.yoursite.com']
}));
```

### CSRF Protection

The widget automatically includes CSRF tokens if present:

```html
<meta name="csrf-token" content="your-csrf-token">
```

The token is sent as the `X-CSRF-Token` header.

### Session-Based Submission

Form submissions use `credentials: 'include'` to send the user's session cookies, ensuring submissions are authenticated using the publisher's existing auth system.

### Site Key Validation

In production, validate the `siteKey` parameter to ensure only authorized sites can use your backend:

```javascript
const ALLOWED_SITES = {
  'SITE_ABC_123': { domain: 'example.com', name: 'Example Site' }
};

app.post("/llm", async (req, res) => {
  const { siteKey } = req.body;
  
  if (!ALLOWED_SITES[siteKey]) {
    return res.status(403).json({ error: "Invalid site key" });
  }
  
  // ... rest of handler
});
```

## Deployment

### Backend Deployment

The backend can be deployed to any Node.js hosting platform:

- **Heroku**: `git push heroku main`
- **Vercel**: `vercel deploy`
- **AWS/GCP/Azure**: Use their Node.js deployment options
- **Docker**: Build and deploy the container

Make sure to set the `OPENAI_API_KEY` environment variable.

### Widget Distribution

Host `widget.js` on a CDN:

1. Upload to your CDN (CloudFlare, AWS CloudFront, etc.)
2. Update the script `src` in your integration code
3. Ensure CORS headers allow loading from publisher domains

## Project Structure

```
AI-widget/
├── backend/
│   ├── server.js          # Express server with OpenAI integration
│   ├── package.json       # Node.js dependencies
│   └── .env.example       # Environment variable template
├── widget/
│   └── widget.js          # Frontend widget code
├── examples/
│   ├── index.html         # Demo page
│   └── ai-config/
│       └── contact.json   # Example config
└── README.md
```

## Requirements

- Node.js 18+ (for backend)
- OpenAI API key
- Modern browser with ES6 support (for widget)

## License

ISC

## Support

For issues and questions, please open an issue on GitHub.
