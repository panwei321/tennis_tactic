-- export_tactics.sql - 从业务库导出已发布战术为 JSON（供 tools/import_export.js 导入本仓库）
-- 列名与 public 的 tactics_v1.0.sql 建表语句一致（驼峰列名）。
--
-- 用法（在本仓库根目录执行，导出的文件已被 .gitignore 忽略，不会误提交）：
--   mysql -h <host> -P <port> -u <user> -p --default-character-set=utf8mb4 -N <dbname> < tools/export_tactics.sql > tools/export.json
--
-- 说明：
-- - 仅导出 status = 1（已发布）的战术；
-- - 子查询先排序，尽量保持 sortOrder 顺序（JSON_ARRAYAGG 不保证顺序）；
-- - 输出为单行 JSON 数组，字符串中的换行/制表符会被 mysql 客户端转义，仍为合法 JSON。

SELECT JSON_ARRAYAGG(JSON_OBJECT(
         'dbId',          t.id,
         'name',          t.name,
         'category',      IFNULL(c.name, '未分类'),
         'sortOrder',     t.sortOrder,
         'protocolVersion', t.protocolVersion,
         'introduction',  t.introduction,
         'purpose',       t.purpose,
         'scenarios',     t.scenarios,
         'tips',          t.tips,
         'script',        CAST(t.scriptJson AS JSON)
       ))
FROM (
  SELECT t.*
  FROM tactic t
  WHERE t.status = 1
  ORDER BY t.sortOrder, t.id
) t
LEFT JOIN tactic_category c ON t.categoryId = c.id;
