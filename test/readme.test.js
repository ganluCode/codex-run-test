import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

async function readReadme() {
  // 以 UTF-8 明确读取，验证 README 编码可正常解析
  return readFile(join(projectRoot, 'README.md'), 'utf8');
}

test('README 说明运行环境要求与零依赖特性', async () => {
  const readme = await readReadme();
  assert.match(readme, /Node\.js\s*20\+/);
  assert.match(readme, /无外部依赖|没有外部/);
  assert.match(readme, /无需\s*npm install|不需要\s*npm install/);
});

test('README 提供实际 CLI 运行命令及四个命令示例', async () => {
  const readme = await readReadme();
  // 实际 CLI 入口为 node src/cli.js
  assert.match(readme, /node\s+src\/cli\.js/);
  for (const command of ['add', 'list', 'complete', 'remove']) {
    assert.match(readme, new RegExp(`node\\s+src/cli\\.js\\s+${command}(\\s|$|<)`));
  }
});

test('README 说明默认数据文件位置与跨命令持久化', async () => {
  const readme = await readReadme();
  assert.match(readme, /data\/todos\.json/);
  assert.match(readme, /持久化/);
});

test('README 包含与 package.json 一致的 npm test 命令', async () => {
  const readme = await readReadme();
  const packageJson = JSON.parse(
    await readFile(join(projectRoot, 'package.json'), 'utf8'),
  );
  const script = packageJson.scripts.test;
  assert.ok(script);
  assert.match(readme, /npm test/);
  // README 中不应出现与 package.json 不一致的测试命令
  assert.doesNotMatch(readme, /npm run (?!test\b)\w+/);
});

test('README 不要求联网安装依赖', async () => {
  const readme = await readReadme();
  // README 只能出现“无需 npm install”这类否定表述，不能出现安装依赖的指令
  assert.doesNotMatch(readme, /npm i\b|yarn add|pnpm add|yarn install|pnpm install/);
  assert.doesNotMatch(readme, /^.*(?<!无需\s)npm install.*$/m);
});
