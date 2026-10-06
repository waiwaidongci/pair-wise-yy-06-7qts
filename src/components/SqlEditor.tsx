import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor';
import { useEffect, useRef } from 'react';
import type { DatabaseSchema, QueryErrorDetail } from '../types/sql';
import { formatSql } from '../utils/sqlFormatter';

interface SqlEditorProps {
  value: string;
  schema?: DatabaseSchema;
  error?: QueryErrorDetail | null;
  onChange: (value: string) => void;
  onExecute: () => void;
  onFormat: () => void;
}

export function SqlEditor({
  value,
  schema,
  error,
  onChange,
  onExecute,
  onFormat,
}: SqlEditorProps) {
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const executeRef = useRef(onExecute);
  const formatRef = useRef(onFormat);
  const schemaRef = useRef(schema);

  executeRef.current = onExecute;
  formatRef.current = onFormat;
  schemaRef.current = schema;

  const beforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;
    monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '.'],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const tables = schemaRef.current?.tables ?? [];
        const sqlBeforeCursor = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const tableMatch = sqlBeforeCursor.match(/\bfrom\s+([a-zA-Z_][\w]*)/i);
        const activeTable = tables.find(
          (table) => table.name.toLowerCase() === tableMatch?.[1]?.toLowerCase(),
        );
        const suggestions = [
          ...['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'DESC', 'LIMIT', 'LIKE', 'IN'].map(
            (keyword) => ({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: keyword,
              range,
              detail: 'SQL 关键字',
            }),
          ),
          ...tables.map((table) => ({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: table.name,
            range,
            detail: table.description,
          })),
          ...(activeTable?.columns ?? []).map((column) => ({
            label: column.name,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: column.name,
            range,
            detail: `${column.type}${column.description ? ` · ${column.description}` : ''}`,
          })),
        ];
        return { suggestions };
      },
    });

    monaco.languages.registerDocumentFormattingEditProvider('sql', {
      provideDocumentFormattingEdits: (model) => [
        {
          range: model.getFullModelRange(),
          text: formatSql(model.getValue()),
        },
      ],
    });
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    const disposables: IDisposable[] = [
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => executeRef.current()),
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => executeRef.current()),
      editor.addAction({
        id: 'format-sql-workbench',
        label: '格式化 SQL',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        run: () => formatRef.current(),
      }),
    ].filter((item): item is IDisposable => item !== null);
    editor.onDidDispose(() => disposables.forEach((item) => item.dispose()));
    editor.focus();
  };

  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(
      model,
      'workbench',
      error
        ? [
            {
              severity: monaco.MarkerSeverity.Error,
              message: `${error.code} · ${error.message}\n${error.hint}`,
              startLineNumber: error.line,
              startColumn: error.column,
              endLineNumber: error.line,
              endColumn: error.column + 1,
            },
          ]
        : [],
    );
  }, [error, value]);

  return (
    <Editor
      height="100%"
      language="sql"
      theme="vs-dark"
      value={value}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(nextValue) => onChange(nextValue ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        lineHeight: 23,
        tabSize: 2,
        automaticLayout: true,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        padding: { top: 14, bottom: 14 },
        suggest: { showKeywords: true, showWords: true },
        quickSuggestions: { other: true, comments: false, strings: false },
        renderLineHighlight: 'all',
        smoothScrolling: true,
      }}
    />
  );
}
