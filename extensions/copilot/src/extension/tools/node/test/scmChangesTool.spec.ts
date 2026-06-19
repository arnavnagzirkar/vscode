/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { Diff, IGitDiffService } from '../../../../platform/git/common/gitDiffService';
import { IGitService, RepoContext } from '../../../../platform/git/common/gitService';
import { NullGitDiffService } from '../../../../platform/git/common/nullGitDiffService';
import { MockGitService } from '../../../../platform/ignore/node/test/mockGitService';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../../../platform/test/node/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { observableValue } from '../../../../util/vs/base/common/observableInternal/observables/observableValue';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Change, Repository } from '../../../../platform/git/vscode/git';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { GetScmChangesTool } from '../scmChangesTool';

class ConfigurableMockGitDiffService extends NullGitDiffService {
	public getChangeDiffsSpy = vi.fn<NullGitDiffService['getChangeDiffs']>();

	override async getChangeDiffs(repository: Repository | vscode.Uri, changes: Change[], token?: CancellationToken): Promise<Diff[]> {
		this.getChangeDiffsSpy(repository, changes, token);
		return [];
	}
}

function makeChange(path: string, status: number): Change {
	const uri = URI.file(path) as unknown as vscode.Uri;
	return { uri, originalUri: uri, renameUri: undefined, status } as Change;
}

function makeRepoContext(overrides: Partial<RepoContext>): RepoContext {
	return {
		rootUri: URI.file('/repo'),
		kind: 'repository',
		isUsingVirtualFileSystem: false,
		headIncomingChanges: undefined,
		headOutgoingChanges: undefined,
		headBranchName: 'main',
		headCommitHash: 'abc123',
		upstreamBranchName: undefined,
		upstreamRemote: undefined,
		isRebasing: false,
		remotes: [],
		worktrees: [],
		changes: undefined,
		headBranchNameObs: observableValue('test', undefined),
		headCommitHashObs: observableValue('test', undefined),
		upstreamBranchNameObs: observableValue('test', undefined),
		upstreamRemoteObs: observableValue('test', undefined),
		isRebasingObs: observableValue('test', false),
		isIgnored: async () => false,
		...overrides,
	};
}

describe('GetScmChangesTool - sourceControlState normalization', () => {
	const stagedFile = makeChange('/repo/staged.ts', 0 /* INDEX_MODIFIED */);
	const unstagedFile = makeChange('/repo/unstaged.ts', 5 /* MODIFIED */);
	const mergeFile = makeChange('/repo/merge.ts', 12 /* ADDED_BY_US */);

	const repoChanges = {
		indexChanges: [stagedFile],
		workingTree: [unstagedFile],
		mergeChanges: [mergeFile],
		untrackedChanges: [],
	};

	let collection: TestingServiceCollection;
	let accessor: ITestingServicesAccessor;
	let mockGitDiffService: ConfigurableMockGitDiffService;
	let mockGitService: MockGitService;

	beforeEach(() => {
		collection = createExtensionUnitTestingServices();

		mockGitDiffService = new ConfigurableMockGitDiffService();
		collection.set(IGitDiffService, mockGitDiffService);

		mockGitService = new MockGitService();
		const repo = makeRepoContext({ changes: repoChanges });
		(mockGitService.activeRepository as ReturnType<typeof observableValue<RepoContext | undefined>>).set(repo, undefined);
		collection.set(IGitService, mockGitService);

		accessor = collection.createTestingAccessor();
	});

	async function invokeScmChangesTool(sourceControlState: unknown) {
		const tool = accessor.get(IInstantiationService).createInstance(GetScmChangesTool);
		await tool.invoke(
			{
				input: { sourceControlState } as { sourceControlState: ('unstaged' | 'staged' | 'merge-conflicts')[] },
				toolInvocationToken: null!,
			},
			CancellationToken.None
		);
		return mockGitDiffService.getChangeDiffsSpy;
	}

	it('uses only staged files when sourceControlState is the string "staged"', async () => {
		const spy = await invokeScmChangesTool('staged');

		expect(spy).toHaveBeenCalledOnce();
		const [, changes] = spy.mock.calls[0];
		expect(changes).toEqual([stagedFile]);
	});

	it('uses only staged files when sourceControlState is the array ["staged"]', async () => {
		const spy = await invokeScmChangesTool(['staged']);

		expect(spy).toHaveBeenCalledOnce();
		const [, changes] = spy.mock.calls[0];
		expect(changes).toEqual([stagedFile]);
	});

	it('uses only unstaged files when sourceControlState is the string "unstaged"', async () => {
		const spy = await invokeScmChangesTool('unstaged');

		expect(spy).toHaveBeenCalledOnce();
		const [, changes] = spy.mock.calls[0];
		expect(changes).toEqual([unstagedFile]);
	});

	it('uses all changes when sourceControlState is undefined', async () => {
		const spy = await invokeScmChangesTool(undefined);

		expect(spy).toHaveBeenCalledOnce();
		const [, changes] = spy.mock.calls[0];
		expect(changes).toEqual([unstagedFile, stagedFile, mergeFile]);
	});

	it('uses both staged and unstaged when sourceControlState is ["staged", "unstaged"]', async () => {
		const spy = await invokeScmChangesTool(['staged', 'unstaged']);

		expect(spy).toHaveBeenCalledOnce();
		const [, changes] = spy.mock.calls[0];
		expect(changes).toEqual([stagedFile, unstagedFile]);
	});
});
