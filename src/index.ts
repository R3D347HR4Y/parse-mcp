#!/usr/bin/env node

/**
 * Parse Server MCP Server
 *
 * An MCP (Model Context Protocol) server that enables AI agents to interact with
 * Parse Server instances. Provides tools for database exploration, querying,
 * troubleshooting, and safe data modification.
 *
 * Environment Variables:
 * - PARSE_SERVER_URL: The Parse Server URL (e.g., https://parseapi.back4app.com)
 * - PARSE_APP_ID: Your Parse Application ID
 * - PARSE_MASTER_KEY: Your Parse Master Key (optional, for admin operations)
 * - PARSE_JS_KEY: Your Parse JavaScript Key (optional)
 * - PARSE_REST_KEY: Your Parse REST API Key (optional)
 * - MCP_TRANSPORT: Transport mode - "http" (default) or "stdio"
 * - MCP_PORT: HTTP server port (default: 3000)
 * - MCP_HOST: HTTP server host (default: 0.0.0.0)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Parse from "parse/node.js";
import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "crypto";

// ============================================================================
// Configuration and Initialization
// ============================================================================

const PARSE_SERVER_URL = process.env.PARSE_SERVER_URL || "";
const PARSE_APP_ID = process.env.PARSE_APP_ID || "";
const PARSE_MASTER_KEY = process.env.PARSE_MASTER_KEY || "";
const PARSE_JS_KEY = process.env.PARSE_JS_KEY || "";
const PARSE_REST_KEY = process.env.PARSE_REST_KEY || "";

// MCP Transport configuration
const MCP_TRANSPORT = process.env.MCP_TRANSPORT?.toLowerCase() || "http";
const MCP_PORT = parseInt(process.env.MCP_PORT || "3000", 10);
const MCP_HOST = process.env.MCP_HOST || "0.0.0.0";

let isInitialized = false;

function initializeParse(): { success: boolean; error?: string } {
  if (!PARSE_SERVER_URL) {
    return {
      success: false,
      error: "PARSE_SERVER_URL environment variable is required",
    };
  }
  if (!PARSE_APP_ID) {
    return {
      success: false,
      error: "PARSE_APP_ID environment variable is required",
    };
  }

  try {
    Parse.initialize(PARSE_APP_ID, PARSE_JS_KEY, PARSE_MASTER_KEY);
    Parse.serverURL = PARSE_SERVER_URL;
    isInitialized = true;
    return { success: true };
  } catch (error) {
    return { success: false, error: `Failed to initialize Parse: ${error}` };
  }
}

// Initialize Parse on startup
const initResult = initializeParse();
if (!initResult.success) {
  console.error(`Warning: ${initResult.error}`);
}

// ============================================================================
// Tool Definitions with Comprehensive Documentation
// ============================================================================

const TOOLS = [
  // === Connection & Health ===
  {
    name: "check_connection",
    description: `🔌 **Check Parse Server Connection**

Tests the connection to the Parse Server and returns server health status.

Use this tool FIRST to verify the connection is working before performing any other operations.

Returns:
- Connection status (connected/disconnected)
- Server URL being used
- Whether Master Key is configured
- Any connection errors`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // === Schema Exploration ===
  {
    name: "get_all_schemas",
    description: `📋 **Get All Class Schemas**

Retrieves the complete schema for ALL classes in the Parse Server database.
This is essential for understanding the database structure.

⚠️ REQUIRES MASTER KEY to access schema information.

Returns for each class:
- Class name
- All fields with their types (String, Number, Boolean, Date, Object, Array, Pointer, Relation, File, GeoPoint, Polygon, Bytes)
- For Pointers/Relations: the target class name
- Class-level permissions (CLP)
- Indexes

💡 **TIP**: Call this first to understand what data exists in the database before querying.`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_class_schema",
    description: `📋 **Get Schema for a Specific Class**

Retrieves the detailed schema for a single Parse class.

⚠️ REQUIRES MASTER KEY to access schema information.

Parameters:
- className: The name of the class (e.g., "User", "Product", "GameScore")

Returns:
- All fields with their types
- For Pointers: the target class (e.g., Pointer<User>)
- For Relations: the target class (e.g., Relation<Comment>)
- Class-level permissions
- Indexes

💡 **TIP**: Use this to understand the structure of a specific class before querying it.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the Parse class to get schema for",
        },
      },
      required: ["className"],
    },
  },

  // === Data Exploration & Querying ===
  {
    name: "get_sample_objects",
    description: `🔍 **Get Sample Objects from a Class**

Retrieves a few recent objects from a class to understand its actual data structure.

This is HIGHLY RECOMMENDED before writing queries because:
- Schemas may have evolved over time (new fields added, old ones deprecated)
- Some objects may have optional fields that aren't always present
- Real data helps understand the actual values and formats used

Parameters:
- className: The name of the class to sample
- limit: Number of objects to retrieve (default: 5, max: 20)
- includePointers: Whether to include full pointer objects (default: false)

Returns:
- Array of sample objects with all their fields
- Objects are sorted by createdAt (newest first)

💡 **TIP**: Always call this for classes you're unfamiliar with to see real data examples.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the Parse class to sample",
        },
        limit: {
          type: "number",
          description: "Number of objects to retrieve (default: 5, max: 20)",
        },
        includePointers: {
          type: "boolean",
          description:
            "Whether to include full pointer objects instead of just references (default: false)",
        },
      },
      required: ["className"],
    },
  },
  {
    name: "query_class",
    description: `🔍 **Query Objects from a Class**

Performs a query on a Parse class with various filters and options.

Parameters:
- className: The name of the class to query
- where: Query constraints as a JSON object (see below for syntax)
- limit: Maximum objects to return (default: 100, max: 1000)
- skip: Number of objects to skip for pagination
- order: Field(s) to sort by. Prefix with "-" for descending (e.g., "-createdAt")
- include: Array of pointer fields to include full objects for
- keys: Array of fields to return (omit for all fields)
- count: If true, also return total count matching query

**Query Constraint Syntax (where parameter):**
\`\`\`json
{
  "field": "value",                    // Equals
  "field": { "$ne": "value" },         // Not equals
  "field": { "$lt": 10 },              // Less than
  "field": { "$lte": 10 },             // Less than or equal
  "field": { "$gt": 10 },              // Greater than
  "field": { "$gte": 10 },             // Greater than or equal
  "field": { "$in": ["a", "b"] },      // In array
  "field": { "$nin": ["a", "b"] },     // Not in array
  "field": { "$exists": true },        // Field exists
  "field": { "$regex": "pattern" },    // Regex match
  "field": { "$regex": "pattern", "$options": "i" },  // Case-insensitive regex
  "$or": [{ "a": 1 }, { "b": 2 }],     // OR conditions
  "$and": [{ "a": 1 }, { "b": 2 }],    // AND conditions
  "pointer": { "__type": "Pointer", "className": "X", "objectId": "abc" }  // Pointer match
}
\`\`\`

💡 **TIP**: Use get_sample_objects first to understand the data structure before writing complex queries.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the Parse class to query",
        },
        where: {
          type: "object",
          description: "Query constraints as a JSON object",
        },
        limit: {
          type: "number",
          description: "Maximum objects to return (default: 100, max: 1000)",
        },
        skip: {
          type: "number",
          description: "Number of objects to skip for pagination",
        },
        order: {
          type: "string",
          description:
            "Field(s) to sort by. Prefix with '-' for descending. Comma-separate multiple fields.",
        },
        include: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of pointer field names to include full objects for",
        },
        keys: {
          type: "array",
          items: { type: "string" },
          description: "Array of field names to return (omit for all)",
        },
        count: {
          type: "boolean",
          description: "If true, also return total count matching query",
        },
      },
      required: ["className"],
    },
  },
  {
    name: "count_objects",
    description: `📊 **Count Objects in a Class**

Returns the total count of objects matching a query.

Parameters:
- className: The name of the class to count
- where: Optional query constraints (same syntax as query_class)

Returns:
- Total count of matching objects

💡 **TIP**: Useful for understanding data volume before running large queries.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the Parse class to count",
        },
        where: {
          type: "object",
          description: "Optional query constraints",
        },
      },
      required: ["className"],
    },
  },
  {
    name: "get_object_by_id",
    description: `🔍 **Get a Single Object by ID**

Retrieves a specific object by its objectId.

Parameters:
- className: The name of the class
- objectId: The unique objectId of the object
- include: Array of pointer fields to include full objects for

Returns:
- The complete object with all fields

💡 **TIP**: Use this when you know the exact object you need.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the Parse class",
        },
        objectId: {
          type: "string",
          description: "The objectId of the object to retrieve",
        },
        include: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of pointer field names to include full objects for",
        },
      },
      required: ["className", "objectId"],
    },
  },

  // === Relation Queries ===
  {
    name: "query_relation",
    description: `🔗 **Query Relation Field**

Queries objects in a Relation field of a parent object.

Parse Relations are many-to-many relationships stored separately from the parent object.

Parameters:
- parentClassName: The class name of the parent object
- parentObjectId: The objectId of the parent object
- relationKey: The name of the relation field
- where: Optional additional query constraints on related objects
- limit: Maximum objects to return (default: 100)
- skip: Number to skip for pagination
- order: Field to sort by

Example: Get all comments related to a post:
- parentClassName: "Post"
- parentObjectId: "abc123"
- relationKey: "comments"

Returns:
- Array of related objects`,
    inputSchema: {
      type: "object" as const,
      properties: {
        parentClassName: {
          type: "string",
          description: "The class name of the parent object",
        },
        parentObjectId: {
          type: "string",
          description: "The objectId of the parent object",
        },
        relationKey: {
          type: "string",
          description: "The name of the relation field",
        },
        where: {
          type: "object",
          description: "Optional additional query constraints",
        },
        limit: {
          type: "number",
          description: "Maximum objects to return (default: 100)",
        },
        skip: {
          type: "number",
          description: "Number of objects to skip",
        },
        order: {
          type: "string",
          description: "Field to sort by",
        },
      },
      required: ["parentClassName", "parentObjectId", "relationKey"],
    },
  },

  // === Data Modification (with warnings) ===
  {
    name: "create_object",
    description: `➕ **Create a New Object**

⚠️ **WARNING: This tool MODIFIES the database!**
🛡️ **ALWAYS ask the user for permission before creating objects.**

Creates a new object in a Parse class.

Parameters:
- className: The name of the class to create the object in
- data: Object containing the field values to set

For setting Pointers, use this format:
\`\`\`json
{
  "pointerField": {
    "__type": "Pointer",
    "className": "TargetClass",
    "objectId": "targetObjectId"
  }
}
\`\`\`

For setting Files:
\`\`\`json
{
  "fileField": {
    "__type": "File",
    "name": "filename.jpg",
    "url": "https://..."
  }
}
\`\`\`

For setting GeoPoints:
\`\`\`json
{
  "location": {
    "__type": "GeoPoint",
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
\`\`\`

Returns:
- The created object with objectId, createdAt, and all fields`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the class to create the object in",
        },
        data: {
          type: "object",
          description: "The field values for the new object",
        },
      },
      required: ["className", "data"],
    },
  },
  {
    name: "update_object",
    description: `✏️ **Update an Existing Object**

⚠️ **WARNING: This tool MODIFIES the database!**
🛡️ **ALWAYS ask the user for permission before updating objects.**

Updates an existing object with new field values.

Parameters:
- className: The name of the class
- objectId: The objectId of the object to update
- data: Object containing the field values to update

Special operations in data:
- To increment a number: { "score": { "__op": "Increment", "amount": 1 } }
- To add to array: { "tags": { "__op": "Add", "objects": ["new"] } }
- To add unique to array: { "tags": { "__op": "AddUnique", "objects": ["new"] } }
- To remove from array: { "tags": { "__op": "Remove", "objects": ["old"] } }
- To delete a field: { "obsoleteField": { "__op": "Delete" } }

Returns:
- The updated object

💡 **TIP**: First use get_object_by_id to see current values before updating.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the class",
        },
        objectId: {
          type: "string",
          description: "The objectId of the object to update",
        },
        data: {
          type: "object",
          description: "The field values to update",
        },
      },
      required: ["className", "objectId", "data"],
    },
  },
  {
    name: "delete_object",
    description: `🗑️ **Delete an Object**

⚠️ **DANGER: This tool PERMANENTLY DELETES data!**
🛡️ **ALWAYS ask the user for explicit permission before deleting.**
⚠️ **This action cannot be undone!**

Deletes an object from a Parse class.

Parameters:
- className: The name of the class
- objectId: The objectId of the object to delete

Returns:
- Confirmation of deletion

💡 **TIP**: First use get_object_by_id to verify this is the correct object to delete.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the class",
        },
        objectId: {
          type: "string",
          description: "The objectId of the object to delete",
        },
      },
      required: ["className", "objectId"],
    },
  },

  // === Relation Modification ===
  {
    name: "add_to_relation",
    description: `🔗 **Add Objects to a Relation**

⚠️ **WARNING: This tool MODIFIES the database!**
🛡️ **ALWAYS ask the user for permission before modifying relations.**

Adds one or more objects to a Relation field.

Parameters:
- parentClassName: The class of the parent object
- parentObjectId: The objectId of the parent
- relationKey: The name of the relation field
- targetClassName: The class of objects to add
- targetObjectIds: Array of objectIds to add to the relation

Example: Add comments to a post's "comments" relation
- parentClassName: "Post"
- parentObjectId: "abc123"
- relationKey: "comments"
- targetClassName: "Comment"
- targetObjectIds: ["comment1", "comment2"]`,
    inputSchema: {
      type: "object" as const,
      properties: {
        parentClassName: {
          type: "string",
          description: "The class of the parent object",
        },
        parentObjectId: {
          type: "string",
          description: "The objectId of the parent",
        },
        relationKey: {
          type: "string",
          description: "The name of the relation field",
        },
        targetClassName: {
          type: "string",
          description: "The class of objects to add",
        },
        targetObjectIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of objectIds to add to the relation",
        },
      },
      required: [
        "parentClassName",
        "parentObjectId",
        "relationKey",
        "targetClassName",
        "targetObjectIds",
      ],
    },
  },
  {
    name: "remove_from_relation",
    description: `🔗 **Remove Objects from a Relation**

⚠️ **WARNING: This tool MODIFIES the database!**
🛡️ **ALWAYS ask the user for permission before modifying relations.**

Removes one or more objects from a Relation field.

Parameters:
- parentClassName: The class of the parent object
- parentObjectId: The objectId of the parent
- relationKey: The name of the relation field
- targetClassName: The class of objects to remove
- targetObjectIds: Array of objectIds to remove from the relation`,
    inputSchema: {
      type: "object" as const,
      properties: {
        parentClassName: {
          type: "string",
          description: "The class of the parent object",
        },
        parentObjectId: {
          type: "string",
          description: "The objectId of the parent",
        },
        relationKey: {
          type: "string",
          description: "The name of the relation field",
        },
        targetClassName: {
          type: "string",
          description: "The class of objects to remove",
        },
        targetObjectIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of objectIds to remove from the relation",
        },
      },
      required: [
        "parentClassName",
        "parentObjectId",
        "relationKey",
        "targetClassName",
        "targetObjectIds",
      ],
    },
  },

  // === User Operations ===
  {
    name: "query_users",
    description: `👥 **Query Users**

Queries the _User class with special handling for user-specific fields.

⚠️ Some user fields may require Master Key for access.

Parameters:
- where: Query constraints (same syntax as query_class)
- limit: Maximum users to return (default: 100)
- skip: Number to skip for pagination
- order: Field to sort by
- keys: Array of fields to return

Note: Password field is never returned for security.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        where: {
          type: "object",
          description: "Query constraints",
        },
        limit: {
          type: "number",
          description: "Maximum users to return (default: 100)",
        },
        skip: {
          type: "number",
          description: "Number to skip",
        },
        order: {
          type: "string",
          description: "Field to sort by",
        },
        keys: {
          type: "array",
          items: { type: "string" },
          description: "Fields to return",
        },
      },
      required: [],
    },
  },

  // === Role Operations ===
  {
    name: "get_roles",
    description: `🔐 **Get All Roles**

Retrieves all roles defined in the Parse Server.

Returns:
- Array of roles with their names and ACLs
- Roles are used for access control`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_role_users",
    description: `🔐 **Get Users in a Role**

Retrieves all users that belong to a specific role.

Parameters:
- roleName: The name of the role

Returns:
- Array of users in the role`,
    inputSchema: {
      type: "object" as const,
      properties: {
        roleName: {
          type: "string",
          description: "The name of the role",
        },
      },
      required: ["roleName"],
    },
  },

  // === Cloud Code Execution ===
  {
    name: "run_cloud_function",
    description: `☁️ **Run Cloud Code Function**

⚠️ **WARNING: Cloud functions may MODIFY data or have side effects!**
🛡️ **ALWAYS ask the user for permission before running cloud functions.**

Executes a Cloud Code function defined on the Parse Server.

Parameters:
- functionName: The name of the cloud function to call
- params: Optional parameters to pass to the function

Returns:
- The result returned by the cloud function

💡 **TIP**: You may not know what cloud functions exist. Ask the user or check documentation.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        functionName: {
          type: "string",
          description: "The name of the cloud function to call",
        },
        params: {
          type: "object",
          description: "Parameters to pass to the function",
        },
      },
      required: ["functionName"],
    },
  },

  // === Aggregation ===
  {
    name: "aggregate_class",
    description: `📊 **Aggregate Data in a Class**

Performs aggregation operations on a Parse class (like MongoDB aggregation pipeline).

⚠️ REQUIRES MASTER KEY for aggregate operations.

Parameters:
- className: The name of the class to aggregate
- pipeline: Array of aggregation pipeline stages

**Common Pipeline Stages:**
\`\`\`json
[
  { "$match": { "status": "active" } },         // Filter documents
  { "$group": { "_id": "$category", "count": { "$sum": 1 } } },  // Group and count
  { "$sort": { "count": -1 } },                 // Sort results
  { "$limit": 10 },                             // Limit results
  { "$project": { "name": 1, "total": "$count" } }  // Shape output
]
\`\`\`

**Aggregation Operators:**
- $sum, $avg, $min, $max, $first, $last
- $push, $addToSet (for arrays)

Returns:
- Array of aggregated results`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the class to aggregate",
        },
        pipeline: {
          type: "array",
          description: "Array of aggregation pipeline stages",
        },
      },
      required: ["className", "pipeline"],
    },
  },

  // === Batch Operations ===
  {
    name: "batch_create",
    description: `➕ **Batch Create Multiple Objects**

⚠️ **WARNING: This tool MODIFIES the database with MULTIPLE objects!**
🛡️ **ALWAYS ask the user for permission before batch creating.**

Creates multiple objects in a single request.

Parameters:
- className: The name of the class
- objects: Array of objects to create (max 50)

Returns:
- Array of created objects with their objectIds`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the class",
        },
        objects: {
          type: "array",
          description: "Array of objects to create (max 50)",
        },
      },
      required: ["className", "objects"],
    },
  },
  {
    name: "batch_update",
    description: `✏️ **Batch Update Multiple Objects**

⚠️ **WARNING: This tool MODIFIES MULTIPLE objects in the database!**
🛡️ **ALWAYS ask the user for permission before batch updating.**
⚠️ **Review the updates carefully before executing.**

Updates multiple objects in a single request.

Parameters:
- className: The name of the class
- updates: Array of { objectId, data } pairs (max 50)

Example:
\`\`\`json
{
  "updates": [
    { "objectId": "abc123", "data": { "status": "processed" } },
    { "objectId": "def456", "data": { "status": "processed" } }
  ]
}
\`\`\`

Returns:
- Array of update results`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the class",
        },
        updates: {
          type: "array",
          description: "Array of { objectId, data } pairs (max 50)",
        },
      },
      required: ["className", "updates"],
    },
  },
  {
    name: "batch_delete",
    description: `🗑️ **Batch Delete Multiple Objects**

⚠️ **EXTREME DANGER: This tool PERMANENTLY DELETES MULTIPLE objects!**
🛡️ **ALWAYS ask for EXPLICIT permission before batch deleting.**
⚠️ **This action CANNOT be undone!**
⚠️ **Double-check the objectIds before executing!**

Deletes multiple objects in a single request.

Parameters:
- className: The name of the class
- objectIds: Array of objectIds to delete (max 50)

Returns:
- Confirmation of deletions`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The name of the class",
        },
        objectIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of objectIds to delete (max 50)",
        },
      },
      required: ["className", "objectIds"],
    },
  },

  // === Troubleshooting ===
  {
    name: "validate_pointer",
    description: `🔍 **Validate a Pointer Reference**

Checks if a pointer reference is valid (the target object exists).

Parameters:
- className: The target class of the pointer
- objectId: The objectId referenced by the pointer

Returns:
- Whether the pointer is valid
- The target object if it exists

💡 **TIP**: Use this to troubleshoot broken/orphaned pointers.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The target class of the pointer",
        },
        objectId: {
          type: "string",
          description: "The objectId referenced by the pointer",
        },
      },
      required: ["className", "objectId"],
    },
  },
  {
    name: "find_orphaned_pointers",
    description: `🔍 **Find Orphaned Pointers in a Class**

Scans a class to find pointers that reference non-existent objects.

⚠️ This can be slow for large classes. Consider using limit/skip for pagination.

Parameters:
- className: The class to scan
- pointerField: The pointer field to check
- limit: Maximum objects to check (default: 100)
- skip: Offset for pagination

Returns:
- List of objects with orphaned pointers
- The broken pointer details

💡 **TIP**: Useful for database cleanup and troubleshooting.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The class to scan",
        },
        pointerField: {
          type: "string",
          description: "The pointer field to check",
        },
        limit: {
          type: "number",
          description: "Maximum objects to check (default: 100)",
        },
        skip: {
          type: "number",
          description: "Offset for pagination",
        },
      },
      required: ["className", "pointerField"],
    },
  },
  {
    name: "get_class_statistics",
    description: `📊 **Get Statistics for a Class**

Retrieves useful statistics about a class.

Parameters:
- className: The class to analyze

Returns:
- Total object count
- Date range (oldest and newest objects)
- Field usage statistics (how many objects have each field)`,
    inputSchema: {
      type: "object" as const,
      properties: {
        className: {
          type: "string",
          description: "The class to analyze",
        },
      },
      required: ["className"],
    },
  },

  // === Config ===
  {
    name: "get_config",
    description: `⚙️ **Get Parse Server Config**

Retrieves the Parse Config values.

Parse Config is a way to store configuration values on the server
that can be fetched by clients.

Returns:
- All config key-value pairs`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "update_config",
    description: `⚙️ **Update Parse Server Config**

⚠️ **WARNING: This tool MODIFIES server configuration!**
🛡️ **ALWAYS ask the user for permission before updating config.**

Updates Parse Config values.

⚠️ REQUIRES MASTER KEY for config updates.

Parameters:
- params: Object with config key-value pairs to set

Returns:
- Success status`,
    inputSchema: {
      type: "object" as const,
      properties: {
        params: {
          type: "object",
          description: "Config key-value pairs to set",
        },
      },
      required: ["params"],
    },
  },
];

// ============================================================================
// Prompt Definitions
// ============================================================================

const PROMPTS = [
  {
    name: "explore_database",
    description:
      "Comprehensive prompt for exploring and understanding a Parse Server database",
    arguments: [],
  },
  {
    name: "troubleshoot_query",
    description:
      "Help troubleshoot a query that's not returning expected results",
    arguments: [
      {
        name: "className",
        description: "The class being queried",
        required: true,
      },
      {
        name: "issue",
        description: "Description of the issue",
        required: true,
      },
    ],
  },
  {
    name: "safe_data_modification",
    description: "Guidelines for safely modifying data with user approval",
    arguments: [],
  },
];

// ============================================================================
// Tool Implementation
// ============================================================================

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  // Check if Parse is initialized
  if (!isInitialized && name !== "check_connection") {
    return {
      error:
        "Parse Server not initialized. Please set PARSE_SERVER_URL and PARSE_APP_ID environment variables.",
    };
  }

  try {
    switch (name) {
      // === Connection & Health ===
      case "check_connection": {
        try {
          // Try to make a simple query to check connection
          const query = new Parse.Query("_User");
          query.limit(1);
          await query.find({ useMasterKey: !!PARSE_MASTER_KEY });
          return {
            status: "connected",
            serverUrl: PARSE_SERVER_URL,
            appId: PARSE_APP_ID,
            hasMasterKey: !!PARSE_MASTER_KEY,
            hasJsKey: !!PARSE_JS_KEY,
            hasRestKey: !!PARSE_REST_KEY,
          };
        } catch (error: unknown) {
          const parseError = error as { code?: number; message?: string };
          return {
            status: "error",
            serverUrl: PARSE_SERVER_URL,
            appId: PARSE_APP_ID,
            hasMasterKey: !!PARSE_MASTER_KEY,
            error: parseError.message || String(error),
            code: parseError.code,
          };
        }
      }

      // === Schema ===
      case "get_all_schemas": {
        if (!PARSE_MASTER_KEY) {
          return {
            error: "Master Key is required to access schema information",
          };
        }
        const schemas = await Parse.Schema.all();
        return schemas.map((schema) => ({
          className: schema.className,
          fields: schema.fields,
          classLevelPermissions: schema.classLevelPermissions,
          indexes: schema.indexes,
        }));
      }

      case "get_class_schema": {
        if (!PARSE_MASTER_KEY) {
          return {
            error: "Master Key is required to access schema information",
          };
        }
        const className = args.className as string;
        const schema = new Parse.Schema(className);
        const result = await schema.get();
        const json = (
          result as unknown as { toJSON(): Record<string, unknown> }
        ).toJSON();
        return {
          className: json.className,
          fields: json.fields,
          classLevelPermissions: json.classLevelPermissions,
          indexes: json.indexes,
        };
      }

      // === Data Exploration ===
      case "get_sample_objects": {
        const className = args.className as string;
        const limit = Math.min((args.limit as number) || 5, 20);
        const includePointers = args.includePointers as boolean;

        const query = new Parse.Query(className);
        query.descending("createdAt");
        query.limit(limit);

        if (includePointers) {
          // Get schema to find pointer fields
          try {
            const schema = new Parse.Schema(className);
            const schemaResult = await schema.get();
            const json = (
              schemaResult as unknown as {
                toJSON(): { fields: Record<string, { type: string }> };
              }
            ).toJSON();
            const fields = json.fields || {};
            const pointerFields = Object.entries(fields)
              .filter(([_, fieldDef]) => fieldDef.type === "Pointer")
              .map(([fieldName]) => fieldName);
            pointerFields.forEach((field) => query.include(field));
          } catch {
            // Schema access might fail without master key, continue without includes
          }
        }

        const results = await query.find({ useMasterKey: !!PARSE_MASTER_KEY });
        return results.map((obj) => obj.toJSON());
      }

      case "query_class": {
        const className = args.className as string;
        const where = args.where as Record<string, unknown> | undefined;
        const limit = Math.min((args.limit as number) || 100, 1000);
        const skip = (args.skip as number) || 0;
        const order = args.order as string | undefined;
        const include = args.include as string[] | undefined;
        const keys = args.keys as string[] | undefined;
        const withCount = args.count as boolean;

        const query = new Parse.Query(className);

        if (where) {
          query.withJSON({ where });
        }

        query.limit(limit);
        query.skip(skip);

        if (order) {
          const orders = order.split(",").map((o) => o.trim());
          orders.forEach((o) => {
            if (o.startsWith("-")) {
              query.descending(o.substring(1));
            } else {
              query.ascending(o);
            }
          });
        }

        if (include) {
          include.forEach((field) => query.include(field));
        }

        if (keys) {
          query.select(keys);
        }

        let count: number | undefined;
        if (withCount) {
          count = await query.count({ useMasterKey: !!PARSE_MASTER_KEY });
        }

        const results = await query.find({ useMasterKey: !!PARSE_MASTER_KEY });
        return {
          results: results.map((obj) => obj.toJSON()),
          count: count,
        };
      }

      case "count_objects": {
        const className = args.className as string;
        const where = args.where as Record<string, unknown> | undefined;

        const query = new Parse.Query(className);
        if (where) {
          query.withJSON({ where });
        }

        const count = await query.count({ useMasterKey: !!PARSE_MASTER_KEY });
        return { count };
      }

      case "get_object_by_id": {
        const className = args.className as string;
        const objectId = args.objectId as string;
        const include = args.include as string[] | undefined;

        const query = new Parse.Query(className);
        if (include) {
          include.forEach((field) => query.include(field));
        }

        const result = await query.get(objectId, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });
        return result.toJSON();
      }

      // === Relations ===
      case "query_relation": {
        const parentClassName = args.parentClassName as string;
        const parentObjectId = args.parentObjectId as string;
        const relationKey = args.relationKey as string;
        const where = args.where as Record<string, unknown> | undefined;
        const limit = Math.min((args.limit as number) || 100, 1000);
        const skip = (args.skip as number) || 0;
        const order = args.order as string | undefined;

        const parentQuery = new Parse.Query(parentClassName);
        const parent = await parentQuery.get(parentObjectId, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        const relation = parent.relation(relationKey);
        const query = relation.query();

        if (where) {
          query.withJSON({ where });
        }

        query.limit(limit);
        query.skip(skip);

        if (order) {
          if (order.startsWith("-")) {
            query.descending(order.substring(1));
          } else {
            query.ascending(order);
          }
        }

        const results = await query.find({ useMasterKey: !!PARSE_MASTER_KEY });
        return results.map((obj) => obj.toJSON());
      }

      // === CRUD Operations ===
      case "create_object": {
        const className = args.className as string;
        const data = args.data as Record<string, unknown>;

        const ParseClass = Parse.Object.extend(className);
        const obj = new ParseClass();

        // Handle special types
        for (const [key, value] of Object.entries(data)) {
          if (
            value &&
            typeof value === "object" &&
            "__type" in (value as Record<string, unknown>)
          ) {
            const typedValue = value as {
              __type: string;
              className?: string;
              objectId?: string;
              latitude?: number;
              longitude?: number;
              name?: string;
              url?: string;
            };
            if (typedValue.__type === "Pointer") {
              const pointer = Parse.Object.extend(
                typedValue.className!
              ).createWithoutData(typedValue.objectId!);
              obj.set(key, pointer);
            } else if (typedValue.__type === "GeoPoint") {
              obj.set(
                key,
                new Parse.GeoPoint(typedValue.latitude!, typedValue.longitude!)
              );
            } else if (typedValue.__type === "File") {
              // Create a file reference from URL - using the raw object format
              obj.set(key, {
                __type: "File",
                name: typedValue.name!,
                url: typedValue.url!,
              });
            } else {
              obj.set(key, value);
            }
          } else {
            obj.set(key, value);
          }
        }

        const result = await obj.save(null, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });
        return result.toJSON();
      }

      case "update_object": {
        const className = args.className as string;
        const objectId = args.objectId as string;
        const data = args.data as Record<string, unknown>;

        const query = new Parse.Query(className);
        const obj = await query.get(objectId, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        for (const [key, value] of Object.entries(data)) {
          if (
            value &&
            typeof value === "object" &&
            "__op" in (value as Record<string, unknown>)
          ) {
            const op = value as {
              __op: string;
              amount?: number;
              objects?: unknown[];
            };
            switch (op.__op) {
              case "Increment":
                obj.increment(key, op.amount || 1);
                break;
              case "Add":
                obj.add(key, op.objects);
                break;
              case "AddUnique":
                obj.addUnique(key, op.objects);
                break;
              case "Remove":
                obj.remove(key, op.objects);
                break;
              case "Delete":
                obj.unset(key);
                break;
              default:
                obj.set(key, value);
            }
          } else if (
            value &&
            typeof value === "object" &&
            "__type" in (value as Record<string, unknown>)
          ) {
            const typedValue = value as {
              __type: string;
              className?: string;
              objectId?: string;
              latitude?: number;
              longitude?: number;
              name?: string;
              url?: string;
            };
            if (typedValue.__type === "Pointer") {
              const pointer = Parse.Object.extend(
                typedValue.className!
              ).createWithoutData(typedValue.objectId!);
              obj.set(key, pointer);
            } else if (typedValue.__type === "GeoPoint") {
              obj.set(
                key,
                new Parse.GeoPoint(typedValue.latitude!, typedValue.longitude!)
              );
            } else {
              obj.set(key, value);
            }
          } else {
            obj.set(key, value);
          }
        }

        const result = await obj.save(null, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });
        return result.toJSON();
      }

      case "delete_object": {
        const className = args.className as string;
        const objectId = args.objectId as string;

        const query = new Parse.Query(className);
        const obj = await query.get(objectId, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });
        await obj.destroy({ useMasterKey: !!PARSE_MASTER_KEY });

        return { success: true, deleted: { className, objectId } };
      }

      // === Relation Modification ===
      case "add_to_relation": {
        const parentClassName = args.parentClassName as string;
        const parentObjectId = args.parentObjectId as string;
        const relationKey = args.relationKey as string;
        const targetClassName = args.targetClassName as string;
        const targetObjectIds = args.targetObjectIds as string[];

        const parentQuery = new Parse.Query(parentClassName);
        const parent = await parentQuery.get(parentObjectId, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        const relation = parent.relation(relationKey);
        const TargetClass = Parse.Object.extend(targetClassName);

        for (const targetId of targetObjectIds) {
          const target = TargetClass.createWithoutData(targetId);
          relation.add(target);
        }

        await parent.save(null, { useMasterKey: !!PARSE_MASTER_KEY });
        return { success: true, added: targetObjectIds.length };
      }

      case "remove_from_relation": {
        const parentClassName = args.parentClassName as string;
        const parentObjectId = args.parentObjectId as string;
        const relationKey = args.relationKey as string;
        const targetClassName = args.targetClassName as string;
        const targetObjectIds = args.targetObjectIds as string[];

        const parentQuery = new Parse.Query(parentClassName);
        const parent = await parentQuery.get(parentObjectId, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        const relation = parent.relation(relationKey);
        const TargetClass = Parse.Object.extend(targetClassName);

        for (const targetId of targetObjectIds) {
          const target = TargetClass.createWithoutData(targetId);
          relation.remove(target);
        }

        await parent.save(null, { useMasterKey: !!PARSE_MASTER_KEY });
        return { success: true, removed: targetObjectIds.length };
      }

      // === Users ===
      case "query_users": {
        const where = args.where as Record<string, unknown> | undefined;
        const limit = Math.min((args.limit as number) || 100, 1000);
        const skip = (args.skip as number) || 0;
        const order = args.order as string | undefined;
        const keys = args.keys as string[] | undefined;

        const query = new Parse.Query(Parse.User);

        if (where) {
          query.withJSON({ where });
        }

        query.limit(limit);
        query.skip(skip);

        if (order) {
          if (order.startsWith("-")) {
            query.descending(order.substring(1));
          } else {
            query.ascending(order);
          }
        }

        if (keys) {
          query.select(keys);
        }

        const results = await query.find({ useMasterKey: !!PARSE_MASTER_KEY });
        return results.map((obj) => obj.toJSON());
      }

      // === Roles ===
      case "get_roles": {
        const query = new Parse.Query(Parse.Role);
        const results = await query.find({ useMasterKey: !!PARSE_MASTER_KEY });
        return results.map((role) => ({
          name: role.getName(),
          objectId: role.id,
          ACL: role.getACL()?.toJSON(),
        }));
      }

      case "get_role_users": {
        const roleName = args.roleName as string;

        const roleQuery = new Parse.Query(Parse.Role);
        roleQuery.equalTo("name", roleName);
        const role = await roleQuery.first({
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        if (!role) {
          return { error: `Role "${roleName}" not found` };
        }

        const usersRelation = role.getUsers();
        const usersQuery = usersRelation.query();
        const users = await usersQuery.find({
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        return users.map((user) => user.toJSON());
      }

      // === Cloud Functions ===
      case "run_cloud_function": {
        const functionName = args.functionName as string;
        const params = args.params as Record<string, unknown> | undefined;

        const result = await Parse.Cloud.run(functionName, params || {});
        return result;
      }

      // === Aggregation ===
      case "aggregate_class": {
        const className = args.className as string;
        const pipeline = args.pipeline as unknown[];

        const query = new Parse.Query(className);
        // aggregate requires master key permission passed differently
        const results = await query.aggregate(
          pipeline as Parameters<typeof query.aggregate>[0]
        );
        return results;
      }

      // === Batch Operations ===
      case "batch_create": {
        const className = args.className as string;
        const objects = args.objects as Record<string, unknown>[];

        if (objects.length > 50) {
          return { error: "Maximum 50 objects per batch" };
        }

        const ParseClass = Parse.Object.extend(className);
        const parseObjects = objects.map((data) => {
          const obj = new ParseClass();
          for (const [key, value] of Object.entries(data)) {
            obj.set(key, value);
          }
          return obj;
        });

        const results = await Parse.Object.saveAll(parseObjects, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });
        return results.map((obj) => obj.toJSON());
      }

      case "batch_update": {
        const className = args.className as string;
        const updates = args.updates as {
          objectId: string;
          data: Record<string, unknown>;
        }[];

        if (updates.length > 50) {
          return { error: "Maximum 50 updates per batch" };
        }

        const results = [];
        for (const update of updates) {
          const query = new Parse.Query(className);
          const obj = await query.get(update.objectId, {
            useMasterKey: !!PARSE_MASTER_KEY,
          });

          for (const [key, value] of Object.entries(update.data)) {
            obj.set(key, value);
          }

          const saved = await obj.save(null, {
            useMasterKey: !!PARSE_MASTER_KEY,
          });
          results.push(saved.toJSON());
        }

        return results;
      }

      case "batch_delete": {
        const className = args.className as string;
        const objectIds = args.objectIds as string[];

        if (objectIds.length > 50) {
          return { error: "Maximum 50 deletions per batch" };
        }

        const ParseClass = Parse.Object.extend(className);
        const objects = objectIds.map((id) => ParseClass.createWithoutData(id));

        await Parse.Object.destroyAll(objects, {
          useMasterKey: !!PARSE_MASTER_KEY,
        });
        return { success: true, deleted: objectIds.length };
      }

      // === Troubleshooting ===
      case "validate_pointer": {
        const className = args.className as string;
        const objectId = args.objectId as string;

        try {
          const query = new Parse.Query(className);
          const obj = await query.get(objectId, {
            useMasterKey: !!PARSE_MASTER_KEY,
          });
          return {
            valid: true,
            object: obj.toJSON(),
          };
        } catch (error: unknown) {
          const parseError = error as { code?: number; message?: string };
          return {
            valid: false,
            error: parseError.message,
            code: parseError.code,
          };
        }
      }

      case "find_orphaned_pointers": {
        const className = args.className as string;
        const pointerField = args.pointerField as string;
        const limit = Math.min((args.limit as number) || 100, 1000);
        const skip = (args.skip as number) || 0;

        const query = new Parse.Query(className);
        query.exists(pointerField);
        query.limit(limit);
        query.skip(skip);

        const results = await query.find({ useMasterKey: !!PARSE_MASTER_KEY });
        const orphaned = [];

        for (const obj of results) {
          const pointer = obj.get(pointerField);
          if (pointer) {
            try {
              const targetQuery = new Parse.Query(pointer.className);
              await targetQuery.get(pointer.id, {
                useMasterKey: !!PARSE_MASTER_KEY,
              });
            } catch {
              orphaned.push({
                objectId: obj.id,
                brokenPointer: {
                  field: pointerField,
                  targetClass: pointer.className,
                  targetId: pointer.id,
                },
              });
            }
          }
        }

        return {
          checked: results.length,
          orphaned: orphaned,
        };
      }

      case "get_class_statistics": {
        const className = args.className as string;

        // Get count
        const countQuery = new Parse.Query(className);
        const count = await countQuery.count({
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        // Get oldest
        const oldestQuery = new Parse.Query(className);
        oldestQuery.ascending("createdAt");
        oldestQuery.limit(1);
        const oldest = await oldestQuery.first({
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        // Get newest
        const newestQuery = new Parse.Query(className);
        newestQuery.descending("createdAt");
        newestQuery.limit(1);
        const newest = await newestQuery.first({
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        // Get field usage (sample-based for performance)
        const sampleQuery = new Parse.Query(className);
        sampleQuery.limit(100);
        const sample = await sampleQuery.find({
          useMasterKey: !!PARSE_MASTER_KEY,
        });

        const fieldUsage: Record<string, number> = {};
        for (const obj of sample) {
          const json = obj.toJSON();
          for (const key of Object.keys(json)) {
            fieldUsage[key] = (fieldUsage[key] || 0) + 1;
          }
        }

        return {
          className,
          totalCount: count,
          dateRange: {
            oldest: oldest?.createdAt,
            newest: newest?.createdAt,
          },
          fieldUsage: {
            sampleSize: sample.length,
            fields: Object.entries(fieldUsage)
              .map(([field, count]) => ({
                field,
                count,
                percentage: Math.round((count / sample.length) * 100),
              }))
              .sort((a, b) => b.count - a.count),
          },
        };
      }

      // === Config ===
      case "get_config": {
        const config = await Parse.Config.get();
        // Parse Config stores values that can be accessed via attributes
        const configObj = config as unknown as {
          attributes?: Record<string, unknown>;
        };
        if (configObj.attributes) {
          return configObj.attributes;
        }
        // Fallback: serialize the config object
        return JSON.parse(JSON.stringify(config));
      }

      case "update_config": {
        if (!PARSE_MASTER_KEY) {
          return { error: "Master Key is required to update config" };
        }
        const params = args.params as Record<string, unknown>;
        const result = await Parse.Config.save(params, { useMasterKey: true });
        return { success: result };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error: unknown) {
    const parseError = error as { code?: number; message?: string };
    return {
      error: parseError.message || String(error),
      code: parseError.code,
    };
  }
}

// ============================================================================
// Prompt Implementation
// ============================================================================

function getPromptContent(name: string, args: Record<string, string>): string {
  switch (name) {
    case "explore_database":
      return `# Parse Server Database Exploration Guide

You are about to explore a Parse Server database. Follow these steps for a comprehensive understanding:

## Step 1: Verify Connection
First, use \`check_connection\` to ensure you can connect to the Parse Server.

## Step 2: Get Database Schema
Use \`get_all_schemas\` to retrieve the complete schema of all classes.
This will show you:
- All class names
- Field definitions and types
- Pointer and Relation relationships
- Class-level permissions

## Step 3: Sample Each Class
For each class you're interested in, use \`get_sample_objects\` to get 5-10 recent objects.
This helps you understand:
- Actual data structure (schemas can be outdated)
- Optional vs required fields
- Real-world data formats
- Common values

## Step 4: Analyze Relationships
For classes with Pointers or Relations:
- Use \`include\` parameter to fetch related objects
- Use \`query_relation\` for many-to-many relationships
- Watch for orphaned pointers using \`validate_pointer\`

## Step 5: Get Statistics
Use \`get_class_statistics\` to understand:
- Data volume
- Date ranges
- Field usage patterns

## Important Notes
- 🛡️ ALWAYS ask permission before modifying any data
- 📋 Some classes may have evolved over time - sample data is more reliable than schema
- ⚠️ Master Key operations have elevated privileges - use carefully`;

    case "troubleshoot_query":
      return `# Query Troubleshooting Guide

**Class:** ${args.className}
**Issue:** ${args.issue}

## Debugging Steps

### 1. Verify the class exists
Use \`get_class_schema\` to confirm the class name and see all available fields.

### 2. Check field types
Query constraints must match field types:
- String fields: use string values
- Number fields: use numeric values
- Boolean fields: use true/false
- Date fields: use ISO date strings
- Pointer fields: use { "__type": "Pointer", "className": "X", "objectId": "..." }

### 3. Get sample data
Use \`get_sample_objects\` to see actual data format. Fields might:
- Have different names than expected
- Be optional (not present on all objects)
- Have different types than documented

### 4. Test query progressively
Start with simple queries and add constraints one at a time:
1. Query with no constraints (get all)
2. Add one constraint at a time
3. Check count at each step

### 5. Common issues
- **No results:** Field name mismatch, case sensitivity, wrong field type
- **Wrong results:** Constraint logic (AND vs OR), missing includes
- **Error messages:** Check Parse error codes for specific issues

### 6. Check permissions
Some data might be restricted by:
- Class-level permissions (CLP)
- Object-level ACLs
- Missing Master Key for protected operations`;

    case "safe_data_modification":
      return `# Safe Data Modification Guidelines

⚠️ **CRITICAL: Always follow these guidelines when modifying data**

## Before Any Modification

1. **GET EXPLICIT PERMISSION**
   Never modify data without user consent. Ask clearly:
   "I'm about to [action]. This will [effect]. Do you want me to proceed?"

2. **VERIFY THE TARGET**
   - Use \`get_object_by_id\` to confirm you have the right object
   - Show the object to the user before modification
   - For batch operations, show a summary of what will change

3. **UNDERSTAND THE IMPACT**
   - Check for dependent data (pointers, relations)
   - Consider cascade effects
   - Note if the change is reversible

## During Modification

4. **START SMALL**
   - For batch operations, test with 1-2 objects first
   - Confirm success before proceeding with larger batches

5. **DOCUMENT CHANGES**
   - Keep track of objectIds modified
   - Note previous values when updating

## Dangerous Operations

🚨 **Extra caution for:**
- \`delete_object\` - Permanent data loss
- \`batch_delete\` - Multiple permanent deletions
- \`update_config\` - Server-wide configuration changes
- Cloud functions - Unknown side effects

## Recovery

If something goes wrong:
- Note the error message and code
- Identify affected objects
- Determine if manual restoration is needed
- Report to the user immediately`;

    default:
      return `Prompt "${name}" not found.`;
  }
}

// ============================================================================
// Server Setup
// ============================================================================

const server = new Server(
  {
    name: "parse-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await handleToolCall(name, args || {});

  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof result === "string" ? result : JSON.stringify(result, null, 2),
      },
    ],
  };
});

// List prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: PROMPTS };
});

// Get prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const content = getPromptContent(name, args || {});

  return {
    description: PROMPTS.find((p) => p.name === name)?.description || "",
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: content,
        },
      },
    ],
  };
});

// List resources (connection info)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "parse://connection-info",
        name: "Parse Server Connection Info",
        description: "Current Parse Server connection configuration",
        mimeType: "application/json",
      },
    ],
  };
});

// Read resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "parse://connection-info") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              serverUrl: PARSE_SERVER_URL,
              appId: PARSE_APP_ID,
              hasMasterKey: !!PARSE_MASTER_KEY,
              hasJsKey: !!PARSE_JS_KEY,
              hasRestKey: !!PARSE_REST_KEY,
              initialized: isInitialized,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

// ============================================================================
// Server Startup
// ============================================================================

async function startHttpServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      transport: "http",
      parse: {
        initialized: isInitialized,
        serverUrl: PARSE_SERVER_URL,
        appId: PARSE_APP_ID,
      },
    });
  });

  // Store transports by session ID for session management
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // MCP endpoint - handles all MCP communication
  app.all("/mcp", async (req: Request, res: Response) => {
    // For GET requests (SSE streams), create a standalone transport
    if (req.method === "GET") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports.set(sessionId, transport);
        },
        onsessionclosed: (sessionId) => {
          transports.delete(sessionId);
        },
      });

      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    // For POST requests, check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport for this session
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // Create new transport for new session or stateless request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport);
      },
      onsessionclosed: (sessionId) => {
        transports.delete(sessionId);
      },
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  // Delete session endpoint
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      transports.delete(sessionId);
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  });

  // Start HTTP server
  app.listen(MCP_PORT, MCP_HOST, () => {
    console.error(`Parse MCP Server running on http://${MCP_HOST}:${MCP_PORT}`);
    console.error(`  - MCP endpoint: http://${MCP_HOST}:${MCP_PORT}/mcp`);
    console.error(`  - Health check: http://${MCP_HOST}:${MCP_PORT}/health`);
    console.error(
      `  - Parse Server: ${PARSE_SERVER_URL || "(not configured)"}`
    );
    console.error(
      `  - Master Key: ${PARSE_MASTER_KEY ? "configured" : "not configured"}`
    );
  });
}

async function startStdioServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Parse MCP Server running on stdio");
}

async function main() {
  if (MCP_TRANSPORT === "stdio") {
    await startStdioServer();
  } else {
    await startHttpServer();
  }
}

main().catch(console.error);
