import {defineConfig, globalIgnores} from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  globalIgnores(['node_modules', '.test', 'main.js', 'build.mjs', 'run-tests.mjs', 'run-table.mjs', 'test/**', 'eslint.config.mjs']),
  ...obsidianmd.configs.recommended,
  {languageOptions: {parserOptions: {projectService: {allowDefaultProject: ['eslint.config.*']}, tsconfigRootDir: import.meta.dirname}}},
]);
