const KEYWORDS = [
  'select',
  'from',
  'where',
  'group by',
  'order by',
  'having',
  'limit',
  'and',
  'or',
  'as',
  'asc',
  'desc',
  'inner join',
  'left join',
  'right join',
  'on',
];

export function formatSql(sql: string): string {
  let result = sql.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
  KEYWORDS.forEach((keyword) => {
    const expression = new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'gi');
    result = result.replace(expression, keyword.toUpperCase());
  });
  const lineBreaks = [
    'FROM',
    'WHERE',
    'GROUP BY',
    'HAVING',
    'ORDER BY',
    'LIMIT',
    'LEFT JOIN',
    'RIGHT JOIN',
    'INNER JOIN',
  ];
  lineBreaks.forEach((keyword) => {
    result = result.replace(new RegExp(`\\s+${keyword}\\s+`, 'g'), `\n${keyword} `);
  });
  result = result.replace(/\s+(AND|OR)\s+/g, '\n  $1 ');
  return result.trim().replace(/;?$/, ';');
}
