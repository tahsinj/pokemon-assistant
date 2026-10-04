import { test, openTool, snap } from './fixtures';

const TOOLS = ['Pokédex', 'Moves', 'Team', 'Battle', 'Calcdex', 'Live', 'EV/IV', 'PC Box', 'Breed', 'Meta', 'Draft'];

for (const tool of TOOLS) {
  test(`${tool} opens without errors`, async ({ app }, testInfo) => {
    await openTool(app, tool);
    await snap(app, testInfo, tool.replace(/[^a-z]/gi, ''));
  });
}
