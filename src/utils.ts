import {readdir} from 'node:fs/promises';

import type {Dirent} from 'node:fs';

import type {
  Context,
  DirectoryContent,
  DirectoryPath,
  ExcludeUndefined,
  LineColumn,
  Module,
  Position,
} from './types';

/**
 * Adds some error to module object.
 */
export const addError = (
  module: Module,
  message: string,
  position?: Position,
  source?: string,
): void => {
  var {errors} = module;

  errors ??= module.errors = {__proto__: null} as unknown as ExcludeUndefined<typeof errors>;

  const {start = 0, startLineColumn, end} = position ?? {};
  const fullMessage =
    end === undefined || source === undefined
      ? message
      : `${message}:\n${source.slice(start, Math.min(end, start + 200))}`;

  const key = start === 0 ? ('1:1' as LineColumn) : (startLineColumn ?? start);

  errors[key] = errors[key] === undefined ? fullMessage : `${errors[key]}\n${fullMessage}`;
};

/**
 * Adds some warning to module object.
 */
export const addWarning = (
  module: Module,
  message: string,
  position?: Position,
  source?: string,
): void => {
  var {warnings} = module;

  warnings ??= module.warnings = {__proto__: null} as unknown as ExcludeUndefined<typeof warnings>;

  const {start = 0, startLineColumn, end} = position ?? {};
  const fullMessage =
    end === undefined || source === undefined
      ? message
      : `${message}:\n${source.slice(start, Math.min(end, start + 200))}`;

  const key = start === 0 ? ('1:1' as LineColumn) : (startLineColumn ?? start);

  warnings[key] = warnings[key] === undefined ? fullMessage : `${warnings[key]}\n${fullMessage}`;
};

export {parseImportsExports} from 'parse-imports-exports';

/**
 * Reads and returns directory content, by directory path (with caching).
 */
export const readDirectory = async (
  directoryPath: DirectoryPath,
  directories: Context['directories'],
): Promise<DirectoryContent | Error> => {
  if (directoryPath in directories) {
    return directories[directoryPath]!;
  }

  var resolve: ((directoryContent: DirectoryContent | Error) => void) | undefined;

  directories[directoryPath] = new Promise<DirectoryContent | Error>((res) => {
    resolve = res;
  });

  const directory: readonly Dirent[] | Error = await readdir(
    directoryPath === '' ? '.' : directoryPath,
    READ_DIRECTORY_OPTIONS,
  ).catch((cause: unknown) => {
    return new Error(
      `Cannot read directory by path \`${directoryPath}\``,
      // @ts-expect-error
      {cause},
    );
  });

  if (directory instanceof Error) {
    directories[directoryPath] = directory;
    resolve!(directory);

    return directory;
  }

  const directoryContent = {__proto__: null} as unknown as DirectoryContent;

  for (const dirent of directory) {
    directoryContent[dirent.name] = dirent;
  }

  directories[directoryPath] = directoryContent;
  resolve!(directoryContent);

  return directoryContent;
};

/**
 * All reserved words of ECMAScript (includes future reserved words
 * and reserved words for strict mode, etc).
 */
export const RESERVED_WORDS = {
  __proto__: null,
  arguments: undefined,
  await: undefined,
  break: undefined,
  case: undefined,
  catch: undefined,
  class: undefined,
  const: undefined,
  continue: undefined,
  debugger: undefined,
  default: undefined,
  delete: undefined,
  do: undefined,
  else: undefined,
  enum: undefined,
  eval: undefined,
  export: undefined,
  extends: undefined,
  false: undefined,
  finally: undefined,
  for: undefined,
  function: undefined,
  if: undefined,
  implements: undefined,
  import: undefined,
  in: undefined,
  instanceof: undefined,
  interface: undefined,
  new: undefined,
  null: undefined,
  package: undefined,
  private: undefined,
  protected: undefined,
  public: undefined,
  return: undefined,
  super: undefined,
  switch: undefined,
  this: undefined,
  throw: undefined,
  true: undefined,
  try: undefined,
  typeof: undefined,
  var: undefined,
  void: undefined,
  while: undefined,
  with: undefined,
  yield: undefined,
};

/**
 * Waits in the main traversal function for the completion
 * of all asynchronous tasks from the passed list.
 */
export const waitTasks = (context: Context, newTasks: readonly Promise<unknown>[]): void => {
  const {errors, graph, resolve, tasks} = context;

  for (const newTask of newTasks) {
    const index = tasks.length;

    tasks.push(newTask);

    newTask.then(
      () => {
        context.completedTasksCount += 1;
        tasks[index] = undefined;

        if (context.completedTasksCount === tasks.length) {
          resolve(graph);
        }
      },
      (cause: unknown) => {
        // @ts-expect-error
        errors.push(new Error('Caught an error from asynchronous task', {cause}));

        context.completedTasksCount += 1;
        tasks[index] = undefined;

        if (context.completedTasksCount === tasks.length) {
          resolve(graph);
        }
      },
    );
  }
};

/**
 * Options to read directory content (for `readdir` function).
 */
const READ_DIRECTORY_OPTIONS = {withFileTypes: true} as const;
