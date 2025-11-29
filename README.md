# Parse MCP Server 🗄️

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that enables AI agents to interact with [Parse Server](https://github.com/parse-community/parse-server) instances. Explore databases, query classes, troubleshoot issues, and safely modify data through natural language.
By Eliott Guillaumin

[![Node Version](https://img.shields.io/badge/nodejs-18,_20,_22,_24-green.svg?logo=node.js&style=flat)](https://nodejs.org)

## Features

- 🔍 **Database Exploration** - Discover schemas, classes, and relationships
- 📊 **Querying** - Full Parse query support with filters, sorting, pagination
- 🔗 **Relations** - Query and manage Pointer and Relation fields
- ✏️ **CRUD Operations** - Create, read, update, delete objects (with safety prompts)
- 📦 **Batch Operations** - Bulk create, update, and delete
- ☁️ **Cloud Functions** - Execute Parse Cloud Code
- 📈 **Aggregation** - MongoDB-style aggregation pipelines
- 🔐 **Roles & Users** - Query users and roles
- 🛡️ **Safety First** - Built-in prompts to ask permission before modifications

## Quick Start

### Prerequisites

- Node.js 18+ (or Docker)
- A Parse Server instance with valid credentials

### Installation

```bash
# Clone or download the project
git clone https://github.com/your-org/parse-mcp-server.git
cd parse-mcp-server

# Install dependencies
npm install

# Build
npm run build
```

### Environment Variables

#### Parse Server Configuration

| Variable           | Required | Description                                              |
| ------------------ | -------- | -------------------------------------------------------- |
| `PARSE_SERVER_URL` | ✅       | Parse Server URL (e.g., `https://parseapi.back4app.com`) |
| `PARSE_APP_ID`     | ✅       | Your Parse Application ID                                |
| `PARSE_MASTER_KEY` | ⚠️       | Master Key for admin operations (schema access, config)  |
| `PARSE_JS_KEY`     | ❌       | JavaScript Key (optional)                                |
| `PARSE_REST_KEY`   | ❌       | REST API Key (optional)                                  |

#### MCP Transport Configuration

| Variable        | Default   | Description                                |
| --------------- | --------- | ------------------------------------------ |
| `MCP_TRANSPORT` | `http`    | Transport mode: `http` or `stdio`          |
| `MCP_PORT`      | `3000`    | HTTP server port (only for HTTP transport) |
| `MCP_HOST`      | `0.0.0.0` | HTTP server host (only for HTTP transport) |

**⚠️ Important:** The Master Key grants full access to your database. Only use it when necessary and never expose it publicly.

## Setup Guides

### HTTP Mode (Default - Recommended for Remote/Docker)

The server runs as an HTTP server by default, making it easy to deploy remotely or in containers.

```bash
# Start the HTTP server (default port 3000)
PARSE_SERVER_URL="https://your-server.com/parse" \
PARSE_APP_ID="your-app-id" \
PARSE_MASTER_KEY="your-master-key" \
npm start

# Or specify a custom port
MCP_PORT=8080 npm start
```

The server exposes:

- `POST /mcp` - MCP Streamable HTTP endpoint
- `GET /mcp` - SSE stream for server-sent events
- `DELETE /mcp` - Session termination
- `GET /health` - Health check endpoint

### Cursor IDE (stdio mode)

For local Cursor IDE integration, use stdio mode. Add to your Cursor settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "parse": {
      "command": "node",
      "args": ["/path/to/parse-mcp-server/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "PARSE_SERVER_URL": "https://your-parse-server.com/parse",
        "PARSE_APP_ID": "your-app-id",
        "PARSE_MASTER_KEY": "your-master-key"
      }
    }
  }
}
```

### Claude Desktop (stdio mode)

Add to your Claude Desktop config (`claude_desktop_config.json`):

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "parse": {
      "command": "node",
      "args": ["/path/to/parse-mcp-server/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "PARSE_SERVER_URL": "https://your-parse-server.com/parse",
        "PARSE_APP_ID": "your-app-id",
        "PARSE_MASTER_KEY": "your-master-key"
      }
    }
  }
}
```

### Running Directly

```bash
# HTTP mode (default) - starts an HTTP server
PARSE_SERVER_URL="https://your-parse-server.com/parse" \
PARSE_APP_ID="your-app-id" \
PARSE_MASTER_KEY="your-master-key" \
node dist/index.js

# stdio mode - for local IDE integration
MCP_TRANSPORT=stdio \
PARSE_SERVER_URL="https://your-parse-server.com/parse" \
PARSE_APP_ID="your-app-id" \
PARSE_MASTER_KEY="your-master-key" \
node dist/index.js
```

### Docker Deployment

Build and run with Docker (no docker-compose needed):

```bash
# Build the image
docker build -t parse-mcp-server .

# Run in HTTP mode (default) - exposes port 3000
docker run -d \
  -p 3000:3000 \
  -e PARSE_SERVER_URL="https://your-parse-server.com/parse" \
  -e PARSE_APP_ID="your-app-id" \
  -e PARSE_MASTER_KEY="your-master-key" \
  parse-mcp-server

# The MCP server is now available at http://localhost:3000/mcp
# Health check: http://localhost:3000/health
```

#### Using Docker with stdio mode (for Cursor/Claude)

For local IDE integration via stdio:

```json
{
  "mcpServers": {
    "parse": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "MCP_TRANSPORT=stdio",
        "-e",
        "PARSE_SERVER_URL=https://your-parse-server.com/parse",
        "-e",
        "PARSE_APP_ID=your-app-id",
        "-e",
        "PARSE_MASTER_KEY=your-master-key",
        "parse-mcp-server"
      ]
    }
  }
}
```

### Back4App Setup

For [Back4App](https://www.back4app.com/) hosted Parse Server:

```json
{
  "mcpServers": {
    "parse": {
      "command": "node",
      "args": ["/path/to/parse-mcp-server/dist/index.js"],
      "env": {
        "PARSE_SERVER_URL": "https://parseapi.back4app.com",
        "PARSE_APP_ID": "your-back4app-app-id",
        "PARSE_MASTER_KEY": "your-back4app-master-key",
        "PARSE_JS_KEY": "your-back4app-js-key"
      }
    }
  }
}
```

Find your keys in Back4App Dashboard → App Settings → Security & Keys.

## Available Tools

### Connection & Health

| Tool               | Description                               |
| ------------------ | ----------------------------------------- |
| `check_connection` | Verify Parse Server connection and health |

### Schema Exploration

| Tool               | Description                                       |
| ------------------ | ------------------------------------------------- |
| `get_all_schemas`  | Get schemas for all classes (requires Master Key) |
| `get_class_schema` | Get schema for a specific class                   |

### Data Exploration

| Tool                 | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| `get_sample_objects` | Get sample objects from a class to understand data structure |
| `query_class`        | Query objects with filters, sorting, pagination              |
| `count_objects`      | Count objects matching a query                               |
| `get_object_by_id`   | Get a specific object by ID                                  |

### Relations

| Tool                   | Description                       |
| ---------------------- | --------------------------------- |
| `query_relation`       | Query objects in a Relation field |
| `add_to_relation`      | Add objects to a Relation ⚠️      |
| `remove_from_relation` | Remove objects from a Relation ⚠️ |

### CRUD Operations

| Tool            | Description                  |
| --------------- | ---------------------------- |
| `create_object` | Create a new object ⚠️       |
| `update_object` | Update an existing object ⚠️ |
| `delete_object` | Delete an object ⚠️ 🔴       |

### Batch Operations

| Tool           | Description                   |
| -------------- | ----------------------------- |
| `batch_create` | Create multiple objects ⚠️    |
| `batch_update` | Update multiple objects ⚠️    |
| `batch_delete` | Delete multiple objects ⚠️ 🔴 |

### Users & Roles

| Tool             | Description                  |
| ---------------- | ---------------------------- |
| `query_users`    | Query the \_User class       |
| `get_roles`      | Get all defined roles        |
| `get_role_users` | Get users in a specific role |

### Cloud Code

| Tool                 | Description                      |
| -------------------- | -------------------------------- |
| `run_cloud_function` | Execute a Cloud Code function ⚠️ |

### Aggregation

| Tool              | Description                                     |
| ----------------- | ----------------------------------------------- |
| `aggregate_class` | Run aggregation pipelines (requires Master Key) |

### Troubleshooting

| Tool                     | Description                                  |
| ------------------------ | -------------------------------------------- |
| `validate_pointer`       | Check if a pointer references a valid object |
| `find_orphaned_pointers` | Find broken pointer references in a class    |
| `get_class_statistics`   | Get statistics about a class                 |

### Configuration

| Tool            | Description                   |
| --------------- | ----------------------------- |
| `get_config`    | Get Parse Config values       |
| `update_config` | Update Parse Config values ⚠️ |

**Legend:**

- ⚠️ = Modifies data (asks for permission)
- 🔴 = Destructive operation (extra caution)

## Usage Examples

### Exploring a Database

```
You: "What classes exist in this Parse database and what data do they contain?"

AI: Let me check the connection and explore the schema...
[Uses check_connection, get_all_schemas, get_sample_objects for each class]
```

### Querying Data

```
You: "Find all users who signed up in the last 7 days and have verified their email"

AI: I'll query the _User class with those filters...
[Uses query_class with date and emailVerified constraints]
```

### Troubleshooting

```
You: "Some of our Order objects seem to have broken user references"

AI: I'll scan the Order class for orphaned user pointers...
[Uses find_orphaned_pointers on the "user" field]
```

### Safe Data Modification

```
You: "Update all products in category 'Electronics' to have a 10% discount"

AI: I found 47 products in the Electronics category. Here are some examples:
[Shows sample products]

Do you want me to proceed with updating all 47 products to add a 10% discount?

You: "Yes, go ahead"

AI: Updating products...
[Uses batch_update with user permission]
```

## Recommended Workflow

When working with an unfamiliar database, the AI should follow this workflow:

1. **Check Connection** → `check_connection`
2. **Get Schema Overview** → `get_all_schemas`
3. **Sample Key Classes** → `get_sample_objects` for each relevant class
4. **Understand Statistics** → `get_class_statistics` for important classes
5. **Query as Needed** → `query_class` with appropriate filters
6. **Ask Permission** → Before any write operations

The AI has built-in prompts that guide it through this workflow and remind it to always ask permission before modifying data.

## Query Syntax

The `query_class` tool supports Parse query syntax. Here are examples:

### Basic Equality

```json
{ "status": "active" }
```

### Comparison Operators

```json
{
  "score": { "$gt": 100 },
  "age": { "$gte": 18, "$lte": 65 }
}
```

### Array Operations

```json
{
  "tags": { "$in": ["featured", "sale"] },
  "category": { "$nin": ["deprecated", "hidden"] }
}
```

### Logical Operators

```json
{
  "$or": [{ "status": "active" }, { "featured": true }]
}
```

### Pointer Matching

```json
{
  "author": {
    "__type": "Pointer",
    "className": "_User",
    "objectId": "abc123"
  }
}
```

### Regular Expressions

```json
{
  "email": { "$regex": "@company\\.com$", "$options": "i" }
}
```

### Field Existence

```json
{
  "profilePicture": { "$exists": true }
}
```

## Aggregation Pipeline

The `aggregate_class` tool supports MongoDB-style aggregation:

```json
[
  { "$match": { "status": "completed" } },
  {
    "$group": {
      "_id": "$category",
      "total": { "$sum": "$amount" },
      "count": { "$sum": 1 },
      "avgAmount": { "$avg": "$amount" }
    }
  },
  { "$sort": { "total": -1 } },
  { "$limit": 10 }
]
```

## Security Considerations

1. **Master Key Protection**: The Master Key bypasses all security. Only use when necessary.
2. **Environment Variables**: Never commit credentials to version control.
3. **Permission Prompts**: The AI is instructed to always ask before modifying data.
4. **Audit Trail**: Consider logging tool usage for compliance.
5. **Least Privilege**: If possible, use keys with limited permissions.

## Troubleshooting

### "Parse Server not initialized"

Check that `PARSE_SERVER_URL` and `PARSE_APP_ID` are set correctly.

### "Master Key is required"

Schema and config operations require the Master Key. Add `PARSE_MASTER_KEY` to your environment.

### "Object not found"

The objectId doesn't exist or you don't have permission to access it. Try with Master Key if appropriate.

### Connection Errors

1. Verify the Parse Server URL is correct and accessible
2. Check if your network/firewall allows the connection
3. Ensure the keys are valid

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run built version
npm start
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## Related Projects

- [Parse Server](https://github.com/parse-community/parse-server) - The open source backend
- [Parse JS SDK](https://github.com/parse-community/Parse-SDK-JS) - JavaScript SDK for Parse
- [MCP Protocol](https://modelcontextprotocol.io/) - Model Context Protocol specification
