# v0.0.1 发布说明 / Release Notes

首个版本发布！这是本项目第一次正式发布，包含两个工具：ID 数据库生成器和 SFM 可视化编程台。

## 本版本包含 / What's in this release

| 文件 | 大小 | 说明 |
|---|---|---|
| `SFM-Builder.exe` | 98.6 MB | SFM 可视化编程台（桌面版，双击打开命令行窗口 + 网页界面） |
| `build_atm10_id_db.exe` | 9.4 MB | ATM10 ID 数据库生成器（单文件 exe，无需 Python） |

## 新功能 / Features

### SFM 可视化编程台
- 图形化拼装 SFM 程序（触发器 / input / output / forget / if 条件）
- 实时生成高亮代码，支持一键复制 / 下载 `.sfm`
- 物品/流体/化学品按 **ID / 中文名 / 英文名 / 拼音首字母** 联想搜索
- 复杂语句展示为**流程图摘要**，双击展开**详细编辑器**
- 粘贴已有 SFM 代码自动识别（注释保留为语句备注）
- 正则编辑、标签库、示例模板、合法性校验

### ATM10 ID 数据库生成器
- 扫描整合包构建物品/流体/化学品 ID 数据库（82,480 条）
- 中英双语名称（含 BBSMC 汉化补丁来源）
- 单文件 exe，无需 Python 环境

## 使用方法 / Usage

**编程台**：双击 `SFM-Builder.exe`，自动弹出命令行日志窗口，浏览器访问 `http://localhost:4173`。

**数据库生成器**：双击 `build_atm10_id_db.exe`，扫描本地解压的 ATM10 整合包并生成数据库。整合包路径通过脚本内 `ROOT` 常量（或环境变量 `ATM10_PACK_DIR`）指定。

## 说明 / Notes

- 本项目全部代码、文档均由 **AI 生成**。
- 数据库以开源整合包 **[ATM10](https://github.com/AllTheMods/ATM-10)** 为样本生成，整合包安装了 **BBSMC 汉化补丁**。
- 完整使用说明见仓库根目录 `readme.md`。

## 已知限制 / Known limitations

- 数据库以 ATM10 为样本，用于其它整合包时建议重新生成。
- `SFM-Builder.exe` 为 Node SEA 单文件打包，首次启动可能被 Windows SmartScreen 拦截，选择「仍要运行」即可。
