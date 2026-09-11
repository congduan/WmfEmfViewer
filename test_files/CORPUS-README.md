# 外部语料库说明（Corpus Sources）

本目录下的新增子目录为从公开渠道收集的 WMF/EMF 测试语料，用于扩展解析器的回归与健壮性测试。

## 目录

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `lo-wmf-corpus/` | 185 | 真实文档抽取所得的 WMF 语料（含普通 WMF、Placeable WMF 和少量 EMF） |
| `ref-emf-corpus/emf-valid/` | 186 | 有效的 EMF 回归测试集（test-001 ~ test-186），覆盖各种记录类型，含 EMF 内嵌 PDF、EMF 内嵌 EMF+ 的特殊样本 |
| `ref-emf-corpus/emf-ea/` | 21 | EMF 带扩展属性（EMF+ 嵌入）样本 |
| `ref-emf-corpus/emf-corrupted/` | 21 | 故意损坏/模糊测试发现的异常 EMF，用于健壮性测试。**预期解析失败或告警** |
| `sample-wmf/` | 5 | WMF 样本（chicken/vegetable/burger/fish 等） |

## 验证结果（2026-09-08，scripts/validate-corpus.js）

```
lo-wmf-corpus            185/185 (100%)
ref-emf-corpus/emf-valid 186/186 (100%)
ref-emf-corpus/emf-ea     21/21  (100%)
ref-emf-corpus/emf-corrupted 19/21  (90%*)   * 损坏样本，2 个失败属预期
sample-wmf                 5/5   (100%)
```

## 重新运行验证

```bash
npm run build:bundle          # 若解析器有改动，先重新打包
node scripts/validate-corpus.js   # 批量解析统计
node scripts/validate-corpus.js lo-wmf-corpus   # 只验证单个目录
```

## 渲染差异对照

```bash
node scripts/diff-emf.js ref-emf-corpus/emf-valid out/emf-diff-valid
```

需要外部参考实现转换器（环境变量 `EMF2SVG` 指定路径）及 rsvg-convert、ImageMagick。
