/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { RelativeWorkspacePathResolver } from '../../utils/relativePathResolver';

function makeFolder(name: string, fsPath: string): vscode.WorkspaceFolder {
	return { name, index: 0, uri: vscode.Uri.file(fsPath) };
}

suite('RelativeWorkspacePathResolver', () => {
	suite('single-root workspace', () => {
		test('should not strip folder name prefix that matches a real subdirectory', () => {
			// Regression: workspace folder "x", path "x/.yarn/sdks/typescript/lib"
			// must NOT have the leading "x/" stripped.
			const folders = [makeFolder('x', '/projects/x')];
			const result = RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('x/.yarn/sdks/typescript/lib', folders);
			assert.strictEqual(result, undefined);
		});

		test('should resolve ./folderName/ prefix in single-root workspace', () => {
			const folders = [makeFolder('x', '/projects/x')];
			const result = RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('./x/.yarn/sdks/typescript/lib', folders);
			assert.strictEqual(result, path.join('/projects/x', '.yarn/sdks/typescript/lib'));
		});
	});

	suite('multi-root workspace', () => {
		test('should strip folder name prefix in multi-root workspace', () => {
			const folders = [
				makeFolder('foo', '/projects/foo'),
				makeFolder('bar', '/projects/bar'),
			];
			const result = RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('foo/node_modules/typescript/lib', folders);
			assert.strictEqual(result, path.join('/projects/foo', 'node_modules/typescript/lib'));
		});

		test('should resolve ./folderName/ prefix in multi-root workspace', () => {
			const folders = [
				makeFolder('foo', '/projects/foo'),
				makeFolder('bar', '/projects/bar'),
			];
			const result = RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('./bar/node_modules/typescript/lib', folders);
			assert.strictEqual(result, path.join('/projects/bar', 'node_modules/typescript/lib'));
		});

		test('should return undefined when no folder name prefix matches', () => {
			const folders = [
				makeFolder('foo', '/projects/foo'),
				makeFolder('bar', '/projects/bar'),
			];
			const result = RelativeWorkspacePathResolver.asAbsoluteWorkspacePath('node_modules/typescript/lib', folders);
			assert.strictEqual(result, undefined);
		});
	});
});
