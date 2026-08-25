import {
  economics,
  financing,
  market,
  scenarios,
  sources,
} from "../needo-roadshow/data.mjs";
import { premiumSlides } from "../needo-roadshow-premium/content.mjs";

process.stdout.write(JSON.stringify({ economics, financing, market, scenarios, sources, premiumSlides }));
