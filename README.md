# Duck Duck MCP

一个基于 DuckDuckGo 搜索引擎的 Model Context Protocol (MCP) 服务器实现。

## 功能特性

- 使用 DuckDuckGo 进行网络搜索
- 支持自定义搜索结果数量（默认 50 条）
- 支持区域设置（默认 zh-cn）
- 支持安全搜索级别设置（OFF/MODERATE/STRICT）
- 提供结构化的搜索结果，包含元数据
- 智能内容分类（文档/文章/社交媒体）
- 自动语言检测
- 主题标签识别

## 安装

```bash
npm install duck-duck-mcp
```

## 使用方法

这是一个 MCP 服务器实现，主要用于与支持 MCP 协议的 AI 客户端（如 Claude）集成。

### 启动服务器：
```bash
mcp-server-search
```

### 搜索参数示例：
```json
{
  "query": "搜索关键词",
  "options": {
    "region": "zh-cn",
    "safeSearch": "MODERATE",
    "numResults": 50
  }
}
```

### 返回结果格式：
```json
{
  "type": "search_results",
  "data": [
    {
      "title": "标题",
      "url": "网址",
      "description": "描述",
      "metadata": {
        "type": "article|documentation|social|other",
        "source": "域名"
      }
    }
  ],
  "metadata": {
    "query": "搜索关键词",
    "timestamp": "时间戳",
    "resultCount": 50,
    "searchContext": {
      "region": "zh-cn",
      "safeSearch": "MODERATE"
    },
    "queryAnalysis": {
      "language": "zh-cn|en",
      "topics": ["technology", "documentation"]
    }
  }
}
```

## License

MIT