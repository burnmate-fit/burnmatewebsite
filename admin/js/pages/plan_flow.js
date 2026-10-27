import { el, header } from '../ui.js';

// How a weekly plan is made: the stand-alone diagram in admin/plan-flow.html,
// shown inside the admin. Keep it current: when a major filter, rule or step
// of plan generation changes in the backend, update plan-flow.html too.
export async function renderPlanFlow(view) {
  view.append(header('Plan Flow', 'How a weekly plan is made: inputs, the food and exercise lanes, the AI, checks and saving. Click any step for its rules and a worked example.'));
  view.append(el('iframe', {
    src: 'plan-flow.html?embed=1',
    title: 'Plan generation flow',
    class: 'w-full block',
    style: 'height: calc(100vh - 140px); min-height: 640px; border: 0; background: #0d0f0c;',
  }));
}
