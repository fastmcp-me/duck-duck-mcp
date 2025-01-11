#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { search, SafeSearchType, SearchOptions } from 'duck-duck-scrape';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// 服务器配置
const SERVER_CONFIG = {
  name: "search-server",
  version: "1.0.0",
} as const;

const SearchArgsSchema = z.object({
  query: z.string(),
  options: z.object({
    region: z.string().default('zh-cn'),
    safeSearch: z.enum(['OFF', 'MODERATE', 'STRICT']).default('MODERATE'),
    numResults: z.number().default(50)
  }).optional()
});

// 错误类型定义
type SearchErrorType = 
  | { type: 'INVALID_ARGS'; details: z.ZodError }
  | { type: 'UNKNOWN_TOOL'; name: string }
  | { type: 'SEARCH_FAILED'; message: string };

interface SearchResultItem {
  title: string;
  url: string;
  description: string;
  metadata?: {
    type: 'article' | 'documentation' | 'social' | 'other';
    source: string;
  };
}

interface SearchResponse {
  type: 'search_results';
  data: SearchResultItem[];
  metadata: {
    query: string;
    timestamp: string;
    resultCount: number;
    searchContext: {
      region: string;
      safeSearch: string;
    };
    queryAnalysis: {
      language: string;
      topics: string[];
    };
  };
}

interface SearchError {
  type: 'search_error';
  message: string;
  suggestion: string;
  context: {
    query?: string;
    options?: Record<string, unknown>;
  };
}

interface DuckDuckGoSearchOptions extends SearchOptions {
  maxResults?: number;
}

function processSearchResults(
  results: Array<{ 
    title: string; 
    url: string; 
    description: string 
  }>, 
  query: string, 
  options: { region?: string; safeSearch?: SafeSearchType }
): SearchResponse {
  return {
    type: 'search_results',
    data: results.map(result => ({
      title: result.title.replace(/&#x27;/g, "'").replace(/&quot;/g, '"'),
      url: result.url,
      description: result.description.trim(),
      metadata: {
        type: detectContentType(result),
        source: new URL(result.url).hostname
      }
    })),
    metadata: {
      query,
      timestamp: new Date().toISOString(),
      resultCount: results.length,
      searchContext: {
        region: options.region || 'zh-cn',
        safeSearch: options.safeSearch?.toString() || 'MODERATE'
      },
      queryAnalysis: {
        language: detectLanguage(query),
        topics: detectTopics(results)
      }
    }
  };
}

function detectContentType(result: { url: string }): 'article' | 'documentation' | 'social' | 'other' {
  const url = result.url.toLowerCase();
  if (url.includes('docs.') || url.includes('/docs/') || url.includes('/documentation/')) {
    return 'documentation';
  }
  if (url.includes('github.com') || url.includes('stackoverflow.com')) {
    return 'documentation';
  }
  if (url.includes('twitter.com') || url.includes('facebook.com') || url.includes('linkedin.com')) {
    return 'social';
  }
  return 'article';
}

function detectLanguage(query: string): string {
  return /[\u4e00-\u9fa5]/.test(query) ? 'zh-cn' : 'en';
}

function detectTopics(results: Array<{ title: string }>): string[] {
  const topics = new Set<string>();
  results.forEach(result => {
    if (result.title.toLowerCase().includes('github')) topics.add('technology');
    if (result.title.toLowerCase().includes('docs')) topics.add('documentation');
  });
  return Array.from(topics);
}

const server = new Server(
  SERVER_CONFIG,
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description: "Search the web using DuckDuckGo",
        inputSchema: zodToJsonSchema(SearchArgsSchema),
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (name !== "search") {
      throw Object.assign(
        new Error(`Unknown tool: ${name}`),
        { errorType: 'UNKNOWN_TOOL' as const, name }
      );
    }

    const parsed = SearchArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw Object.assign(
        new Error(`Invalid arguments: ${parsed.error}`),
        { errorType: 'INVALID_ARGS' as const, details: parsed.error }
      );
    }

    const searchResults = await search(parsed.data.query, {
      region: parsed.data.options?.region || 'zh-cn',
      safeSearch: parsed.data.options?.safeSearch ? SafeSearchType[parsed.data.options.safeSearch as keyof typeof SafeSearchType] : SafeSearchType.MODERATE,
      maxResults: parsed.data.options?.numResults || 5
    } as DuckDuckGoSearchOptions);

    const response = processSearchResults(
      searchResults.results,
      parsed.data.query,
      {
        region: parsed.data.options?.region,
        safeSearch: parsed.data.options?.safeSearch ? SafeSearchType[parsed.data.options.safeSearch as keyof typeof SafeSearchType] : SafeSearchType.MODERATE
      }
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (error) {
    const errorResponse: SearchError = {
      type: 'search_error',
      message: error instanceof Error ? error.message : String(error),
      suggestion: '你可以尝试：1. 修改搜索关键词 2. 减少结果数量 3. 更换地区',
      context: {
        query: (request.params.arguments as { query?: string })?.query,
        options: (request.params.arguments as { options?: Record<string, unknown> })?.options
      }
    };

    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify(errorResponse, null, 2)
      }],
      isError: true
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Search Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});