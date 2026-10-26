import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";

import * as core from "@actions/core";
import * as github from "@actions/github";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";

import { GITHUB_TOKEN, PACKER_VERSION } from "./constants";

function getPlatform() {
	const platform = os.platform();
	switch (platform) {
		case "darwin": {
			return "darwin";
		}
		case "freebsd": {
			return "freebsd";
		}
		case "linux": {
			return "linux";
		}
		case "openbsd": {
			return "openbsd";
		}
		case "win32": {
			return "windows";
		}
		default: {
			throw new Error(`Unsupported platform: ${platform}`);
		}
	}
}

function getArchitecture() {
	const arch = os.arch();
	switch (arch) {
		case "arm": {
			return "arm";
		}
		case "arm64": {
			return "arm64";
		}
		case "ia32": {
			return "386";
		}
		case "x64": {
			return "amd64";
		}
		default: {
			throw new Error(`Unsupported architecture: ${arch}`);
		}
	}
}

function getVariant() {
	const platform = getPlatform();
	const architecture = getArchitecture();
	const variant = `${platform}_${architecture}`;
	return variant;
}

async function getLatestVersion() {
	const octokit = github.getOctokit(GITHUB_TOKEN);
	const {
		data: { tag_name: _version },
	} = await octokit.rest.repos.getLatestRelease({
		owner: "hashicorp",
		repo: "packer",
	});
	const version = _version.slice(1);
	return version;
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

async function getVersion(input: string) {
	const version = input === "latest" ? await getLatestVersion() : input;
	if (!VERSION_PATTERN.test(version)) {
		throw new Error(
			`Invalid packer-version "${version}": expected "latest" or a version like 1.11.2`,
		);
	}
	return version;
}

function getDownloadUrl(version: string, variant: string) {
	const downloadUrl = `https://releases.hashicorp.com/packer/${version}/packer_${version}_${variant}.zip`;
	return downloadUrl;
}

function getChecksumsUrl(version: string) {
	return `https://releases.hashicorp.com/packer/${version}/packer_${version}_SHA256SUMS`;
}

async function sha256(path: string) {
	const hash = crypto.createHash("sha256");
	for await (const chunk of fs.createReadStream(path)) {
		hash.update(chunk);
	}
	return hash.digest("hex");
}

async function verifyChecksum(
	zipPath: string,
	version: string,
	variant: string,
) {
	const checksumsPath = await tc.downloadTool(getChecksumsUrl(version));
	const checksums = fs.readFileSync(checksumsPath, "utf8");
	const fileName = `packer_${version}_${variant}.zip`;
	const line = checksums
		.split("\n")
		.map((l) => l.trim().split(/\s+/))
		.find(([, name]) => name === fileName);
	const expected = line?.[0]?.toLowerCase();
	if (!expected) {
		throw new Error(`No SHA256 checksum found for ${fileName}`);
	}
	const actual = await sha256(zipPath);
	if (actual !== expected) {
		throw new Error(
			`Checksum mismatch for ${fileName}: expected ${expected}, got ${actual}`,
		);
	}
	core.info(`Verified SHA256 checksum for ${fileName}`);
}

export async function acquirePacker(): Promise<void> {
	const version = await getVersion(PACKER_VERSION);
	const variant = getVariant();
	const downloadUrl = getDownloadUrl(version, variant);
	const cachedPath = tc.find("packer", version, variant);
	if (cachedPath === "") {
		const downloadedPath = await tc.downloadTool(downloadUrl);
		await verifyChecksum(downloadedPath, version, variant);
		const extractedPath = await tc.extractZip(downloadedPath);
		const cachedPath = await tc.cacheDir(
			extractedPath,
			"packer",
			version,
			variant,
		);
		core.addPath(cachedPath);
	} else {
		core.addPath(cachedPath);
	}
	const packerPath = await io.which("packer", true);
	core.info(`Version: ${version}`);
	core.info(`Variant: ${variant}`);
	core.info(`Cache location: ${packerPath}`);
}
