# codex-run-test（Todo CLI）

一个零依赖的命令行 Todo 工具，用于演示基于 Node.js 内置模块与内置测试框架的最小可运行项目。

## 环境要求

- Node.js 20+（项目使用 `node --test` 内置测试框架，需要 Node 20 及以上版本）。
- 项目没有外部运行时依赖，无需 npm install 即可直接运行。

## 运行 CLI

CLI 入口为 `src/cli.js`，直接通过 `node` 启动：

```bash
node src/cli.js <command> [args...]
```

可用命令：

- `add <title>`：新增一条 Todo，标题为去首尾空白后非空的文本。
- `list`：列出当前所有 Todo，不接受位置参数。
- `complete <id>`：将指定 ID 的 Todo 标记为已完成。
- `remove <id>`：删除指定 ID 的 Todo。

### 示例

```bash
# 新增任务
node src/cli.js add 买牛奶

# 查看所有任务（输出形如：#1 [未完成] 买牛奶）
node src/cli.js list

# 完成编号为 1 的任务
node src/cli.js complete 1

# 删除编号为 1 的任务
node src/cli.js remove 1
```

## 数据持久化

- 未指定数据文件时，CLI 使用项目内的默认数据文件 `data/todos.json`（首次运行时自动创建目录与文件）。
- 数据会跨命令持久化：一个进程中 `add` 的任务，在后续另一个进程的 `list` 中依然可见。
- 可通过环境变量 `TODO_DATA_FILE` 指定其他数据文件路径（测试即使用此方式隔离数据）。

## 运行测试

```bash
npm test
```

该命令与 `package.json` 中的 `scripts.test` 一致（实际执行 `node --test`），运行 `test/` 目录下的全部测试（单元测试与 CLI 端到端测试），全程离线，不需要联网。
