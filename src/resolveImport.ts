import {addError} from './utils.js';

import type {
  ExcludeUndefined,
  Graph,
  Module,
  ModulePath,
  ModulesChain,
  Name,
  PackagePath,
  RawPath,
  ResolvedImport,
} from './types';

/**
 * Resolves one import of module in graph of ECMAScript/TypeScript modules.
 */
export const resolveImport = <SourceData, DependenciesData>(
  graph: Graph<SourceData, DependenciesData>,
  module: Module<SourceData, DependenciesData>,
  name: Name,
  modulesChain?: ModulesChain,
): ResolvedImport => {
  const {path, reexports} = module;

  var currentModulesChain: ModulesChain | undefined = modulesChain;

  while (currentModulesChain !== undefined) {
    if (currentModulesChain.modulePath === path && currentModulesChain.name === name) {
      return {kind: 'circular', modulePath: path, name};
    }

    currentModulesChain = currentModulesChain.next;
  }

  const newModulesChain: ModulesChain =
    modulesChain === undefined
      ? {modulePath: path, name, next: undefined}
      : {modulePath: path, name, next: modulesChain};

  if (name === 'default') {
    if (module.defaultExport === undefined) {
      return 'error';
    }

    const {by, from: rawPath, namespace} = module.defaultExport;

    if (rawPath === undefined) {
      if (by === undefined) {
        return {kind: 'default', modulePath: path};
      }

      return {kind: 'name', modulePath: path, name: by};
    }

    const reexportObject = reexports?.[rawPath];

    if (reexportObject === undefined) {
      throw new Error(
        `Cannot find reexported module for raw path \`${rawPath}\` in module \`${path}\``,
      );
    }

    if (reexportObject.isSkipped || reexportObject.moduleResolveError !== undefined) {
      return 'error';
    }

    if (reexportObject.resolvedDefault !== undefined) {
      return reexportObject.resolvedDefault;
    }

    const {modulePath, packagePath} = reexportObject;

    if (packagePath !== undefined) {
      if (by !== undefined) {
        reexportObject.resolvedDefault =
          by === 'default'
            ? {kind: 'default from package', packagePath}
            : {kind: 'name from package', name: by, packagePath};

        return reexportObject.resolvedDefault;
      }

      if (namespace !== true) {
        throw new Error(
          `Incorrect default reexport from \`${rawPath}\` (package \`${packagePath}\`) in module \`${path}\``,
        );
      }

      reexportObject.resolvedDefault = {kind: 'namespace from package', packagePath};

      return reexportObject.resolvedDefault;
    }

    if (modulePath === undefined) {
      throw new Error(
        `Cannot find module path or package path in reexport from \`${rawPath}\` in module \`${path}\``,
      );
    }

    const reexportedModule = graph.modules[modulePath];

    if (reexportedModule === undefined) {
      throw new Error(
        `Cannot find module \`${modulePath}\`, reexported from \`${path}\` as \`${rawPath}\``,
      );
    }

    if (by !== undefined) {
      reexportObject.resolvedDefault = resolveImport<SourceData, DependenciesData>(
        graph,
        reexportedModule,
        by,
        newModulesChain,
      );

      return reexportObject.resolvedDefault;
    }

    if (namespace !== true) {
      throw new Error(
        `Incorrect default reexport from module \`${modulePath}\` in module \`${path}\``,
      );
    }

    reexportObject.resolvedDefault = {kind: 'namespace', modulePath};

    return reexportObject.resolvedDefault;
  }

  if (module.exports !== undefined && name in module.exports) {
    const exportObject = module.exports[name]!;

    if (exportObject.kind === 'name') {
      return {kind: 'name', modulePath: path, name: exportObject.by ?? name};
    }

    if (exportObject.kind !== 'reexport') {
      return {kind: 'name', modulePath: path, name};
    }

    const {from: rawPath, namespace} = exportObject;

    const reexportObject = reexports?.[rawPath];

    if (reexportObject === undefined) {
      throw new Error(
        `Cannot find reexported module for raw path \`${rawPath}\` in module \`${path}\``,
      );
    }

    if (reexportObject.isSkipped || reexportObject.moduleResolveError !== undefined) {
      return 'error';
    }

    const {modulePath, namespaces, packagePath} = reexportObject;

    if (namespaces !== undefined && name in namespaces) {
      if (namespace !== true) {
        throw new Error(
          `Incorrect namespace reexport \`${name}\` from \`${rawPath}\` in module \`${path}\``,
        );
      }

      const namespaceObject = namespaces[name]!;

      if (namespaceObject.resolved !== undefined) {
        return namespaceObject.resolved;
      }

      if (packagePath !== undefined) {
        namespaceObject.resolved = {kind: 'namespace from package', packagePath};

        return namespaceObject.resolved;
      }

      if (modulePath === undefined) {
        throw new Error(
          `Cannot find module path or package path in reexport from \`${rawPath}\` in module \`${path}\``,
        );
      }

      namespaceObject.resolved = {kind: 'namespace', modulePath};

      return namespaceObject.resolved;
    }

    if (namespace) {
      throw new Error(
        `Incorrect namespace reexport \`${name}\` from \`${rawPath}\` in module \`${path}\``,
      );
    }

    const nameObject = reexportObject.names![name];

    if (nameObject === undefined) {
      throw new Error(
        `Cannot find reexported name \`${name}\` for reexport from raw path \`${rawPath}\` in module \`${path}\``,
      );
    }

    if (nameObject.resolved !== undefined) {
      return nameObject.resolved;
    }

    if (packagePath !== undefined) {
      const {by = name} = exportObject;

      nameObject.resolved =
        by === 'default'
          ? {kind: 'default from package', packagePath}
          : {kind: 'name from package', name: by, packagePath};

      return nameObject.resolved;
    }

    if (modulePath === undefined) {
      throw new Error(
        `Cannot find module path or package path in reexport from \`${rawPath}\` in module \`${path}\``,
      );
    }

    const reexportedModule = graph.modules[modulePath];

    if (reexportedModule === undefined) {
      throw new Error(
        `Cannot find module \`${modulePath}\`, reexported from \`${path}\` as \`${rawPath}\``,
      );
    }

    const {by = name} = exportObject;

    nameObject.resolved = resolveImport<SourceData, DependenciesData>(
      graph,
      reexportedModule,
      by,
      newModulesChain,
    );

    return nameObject.resolved;
  }

  var firstResolvedThroughStar: ResolvedImport | undefined;
  var modulePathOfFirstResolved: ModulePath | undefined;
  const starredPackagesPaths: PackagePath[] = [];

  for (const rawPath in reexports) {
    const reexportObject = reexports[rawPath as RawPath]!;

    if (reexportObject.star !== true) {
      continue;
    }

    if (reexportObject.packagePath !== undefined) {
      starredPackagesPaths.push(reexportObject.packagePath);

      continue;
    }

    const {modulePath} = reexportObject;

    if (modulePath === undefined) {
      throw new Error(
        `Cannot find module path or package path in reexport from \`${rawPath}\` in module \`${path}\``,
      );
    }

    const reexportedModule = graph.modules[modulePath];

    if (reexportedModule === undefined) {
      throw new Error(
        `Cannot find module \`${modulePath}\`, reexported from \`${path}\` as \`${rawPath}\``,
      );
    }

    let {resolvedThroughStar} = reexportObject;

    resolvedThroughStar ??= reexportObject.resolvedThroughStar = {
      __proto__: null,
    } as ExcludeUndefined<typeof resolvedThroughStar>;

    let resolved = resolvedThroughStar[name];

    resolved ??= resolvedThroughStar[name] = resolveImport<SourceData, DependenciesData>(
      graph,
      reexportedModule,
      name,
      newModulesChain,
    );

    if (resolved === 'error' || resolved.kind === 'circular') {
      continue;
    }

    if (firstResolvedThroughStar === undefined) {
      firstResolvedThroughStar = resolved;
      modulePathOfFirstResolved = reexportedModule.path;
    } else {
      addError(
        module,
        `Duplicate reexported (through star) name \`${name}\` (from module \`${modulePathOfFirstResolved}\` and module \`${modulePath}\`) in module \`${path}\``,
        reexportObject,
      );
    }
  }

  if (firstResolvedThroughStar !== undefined) {
    return firstResolvedThroughStar;
  }

  if (starredPackagesPaths.length > 0) {
    return {kind: 'from packages', name, packagesPaths: starredPackagesPaths};
  }

  return 'error';
};
