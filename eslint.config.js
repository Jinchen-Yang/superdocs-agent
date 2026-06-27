import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// 后端 src/ 的类型感知 lint。核心诉求：no-floating-promises —— 项目大量 fire-and-forget
// (void / .catch(()=>{}))，靠它把"忘了 await/处理的 Promise"挡在 CI。
// web/ 是独立子包、scripts/ 是构建脚本，均不在此 lint 范围。
export default tseslint.config(
  {
    ignores: [
      'node_modules',
      '.mastra',
      'dist',
      'web',
      'scripts',
      '**/*.d.ts',
      'eslint.config.js',
      'vitest.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
    rules: {
      // 本项目的关键护栏：未处理的 Promise 直接报错。
      '@typescript-eslint/no-floating-promises': 'error',
      // Mastra 的 route handler / tool execute 按框架契约必须是 async（可返回 Promise），
      // 即便体内无 await 也合法 —— 关掉这条噪音，避免淹没真正的护栏告警。
      '@typescript-eslint/require-await': 'off',
      // 大量 `as any` 是 Mastra 跨版本兼容的有意逃生舱；关掉 any 噪音，让 lint 聚焦真问题。
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  prettier,
);
