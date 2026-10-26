import * as core from "@actions/core";

import { acquirePacker } from "./installer";
import { validateSubscription } from "./subscription";

async function run() {
	try {
		await validateSubscription();
		await acquirePacker();
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		}
	}
}

void run();
