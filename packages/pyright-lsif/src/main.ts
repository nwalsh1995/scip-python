import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

import { lib } from './lsif';
import { index, formatSnapshot, writeSnapshot } from './lib';
import { Input } from './lsif-typescript/Input';
import * as yargs from 'yargs';
import { join } from 'path';

export function main(): void {
    yargs
        .scriptName('lsif-pyright')
        .usage('$0 <cmd> [args]')
        .version('0.0')
        .command(
            'index [project]',
            'LSIF index a project',
            (yargs) => {
                yargs.positional('project', {
                    type: 'string',
                    default: '.',
                    describe:
                        'path to the TypeScript project to index. Normally, this directory contains a tsconfig.json file.',
                });

                yargs.option('projectName', {
                    type: 'string',
                    default: '',
                    describe: 'name of project',
                });
                yargs.option('projectVersion', {
                    type: 'string',
                    default: '',
                    describe: 'version of project',
                });


                yargs.option('snapshotDir', {
                    type: 'string',
                    default: '',
                    describe: 'snapshot directory',
                });

                yargs.option('environment', {
                    type: 'string',
                    default: '',
                    describe: 'filepath of environment cache. Can be used to speed up multiple executions.',
                });
            },
            (argv) => {
                const workspaceRoot = argv.project as string;
                let snapshotDir = argv.snapshotDir as string;
                const environment = argv.environment as string;

                const projectRoot = workspaceRoot;
                process.chdir(workspaceRoot);

                // TODO: use setup.py / poetry to determine better projectName
                const projectName = argv.projectName as string;

                // TODO: Use setup.py / poetry to determine better projectVersion
                //  for now, the current hash works OK
                let projectVersion = argv.projectVersion as string;
                if (projectVersion === '') {
                    // Default to current git hash
                    projectVersion = child_process.execSync('git rev-parse HEAD').toString().trim();
                }

                const lsifIndex = new lib.codeintel.lsiftyped.Index();

                console.log('Indexing Dir:', projectRoot, ' // version:', projectVersion);

                index({
                    workspaceRoot,
                    projectRoot,
                    projectName,
                    projectVersion,
                    environment,
                    writeIndex: (partialIndex: any): void => {
                        if (partialIndex.metadata) {
                            lsifIndex.metadata = partialIndex.metadata;
                        }
                        for (const doc of partialIndex.documents) {
                            lsifIndex.documents.push(doc);
                        }
                    },
                });

                console.log('Writing to: ', path.join(projectRoot, 'dump.lsif-typed'));
                fs.writeFileSync(path.join(projectRoot, 'dump.lsif-typed'), lsifIndex.serializeBinary());

                if (snapshotDir) {
                    for (const doc of lsifIndex.documents) {
                        if (doc.relative_path.startsWith('..')) {
                            console.log('Skipping Doc:', doc.relative_path);
                            continue;
                        }

                        const inputPath = path.join(projectRoot, doc.relative_path);
                        const input = Input.fromFile(inputPath);
                        const obtained = formatSnapshot(input, doc);
                        const relativeToInputDirectory = path.relative(projectRoot, inputPath);
                        const outputPath = path.resolve(snapshotDir, relativeToInputDirectory);
                        writeSnapshot(outputPath, obtained);
                    }
                }
            }
        )
        .command(
            'snapshot-dir [directory]',
            'create snapshots for directory',
            (yargs) => {
                yargs.positional('directory', {
                    type: 'string',
                    default: '.',
                    describe: 'root before `input` to create snapshots for',
                });

                yargs.option('name', {
                    type: 'string',
                    default: '',
                    describe: 'name of snapshot to run. If passed, only runs this snapshot test',
                });

                yargs.option('environment', {
                    type: 'string',
                    default: '',
                    describe: 'filepath of environment cache. Can be used to speed up multiple executions.',
                });

                yargs.option('projectName', {
                    type: 'string',
                    default: '',
                    describe: 'name of project',
                });
                yargs.option('projectVersion', {
                    type: 'string',
                    default: '',
                    describe: 'version of project',
                });
            },
            (argv) => {
                const projectName = argv.projectName as string || 'snapshot-util';
                const projectVersion = argv.projectVersion as string || '0.1';

                const snapshotRoot = argv.directory as string;
                const snapshotName = argv.name as string;
                const environment = argv.environment as string;

                const inputDirectory = join(snapshotRoot, 'input');
                const outputDirectory = join(snapshotRoot, 'output');

                // Either read all the directories or just the one passed in by name
                let snapshotDirectories = fs.readdirSync(inputDirectory);
                if (snapshotName) {
                    snapshotDirectories = [snapshotName];
                }

                for (const snapshotDir of snapshotDirectories) {
                    const projectRoot = join(inputDirectory, snapshotDir);
                    if (!fs.lstatSync(projectRoot).isDirectory()) {
                      continue;
                    }

                    console.log('Snapshotting: ', projectRoot);

                    const lsifIndex = new lib.codeintel.lsiftyped.Index();
                    index({
                        workspaceRoot: projectRoot,
                        projectRoot,
                        projectName,
                        projectVersion,
                        environment,
                        writeIndex: (partialIndex: any): void => {
                            if (partialIndex.metadata) {
                                lsifIndex.metadata = partialIndex.metadata;
                            }
                            for (const doc of partialIndex.documents) {
                                lsifIndex.documents.push(doc);
                            }
                        },
                    });

                    const lsifTypedBinary = path.join(projectRoot, 'dump.lsif-typed');
                    fs.writeFileSync(lsifTypedBinary, lsifIndex.serializeBinary());

                    for (const doc of lsifIndex.documents) {
                        if (doc.relative_path.startsWith('..')) {
                            continue;
                        }

                        const inputPath = path.join(projectRoot, doc.relative_path);
                        const input = Input.fromFile(inputPath);
                        const obtained = formatSnapshot(input, doc);
                        const relativeToInputDirectory = path.relative(projectRoot, inputPath);
                        const outputPath = path.resolve(outputDirectory, snapshotDir, relativeToInputDirectory);
                        writeSnapshot(outputPath, obtained);
                    }
                }
            }
        )
        // .command(
        //     'versions',
        //     'display version information for current env',
        //     () => {},
        //     () => {
        //         // console.log(packages.getEnvironmentPackages('', 'test'));
        //         throw 'todo: put this back when it is ready';
        //     }
        // )
        .help().argv;
}

main();