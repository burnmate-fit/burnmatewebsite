import { el, header } from '../ui.js';

// How a weekly plan is made and how the CM5 runs a workout: the stand-alone
// two-tab diagram in admin/plan-flow.html, shown inside the admin. Keep it current: when a major filter, rule or step
// of plan generation or of the CM5 tracking flow changes, update plan-flow.html too.
export async function renderPlanFlow(view) {
  view.append(header('Plan Flow', 'Two flowcharts: how a weekly plan is made, and how the CM5 runs a workout (MediaPipe tracking, reps, form cues, sounds, sync). Click any step for its rules and a worked example.'));
  view.append(el('iframe', {
    src: 'plan-flow.html?embed=1',
    title: 'Plan generation flow',
    class: 'w-full block',
    style: 'height: calc(100vh - 140px); min-height: 640px; border: 0; background: #0d0f0c;',
  }));
}
