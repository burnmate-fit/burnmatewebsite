import { api, API_BASE } from '../api.js';
import { el, header, spinner, errorBox, button, card } from '../ui.js';
import { icon } from '../icons.js';

export async function renderUsers(view) {
  view.append(header('Users & Plans', 'Manage user week plans and workouts.'));
  
  const mainGrid = el('div', { class: 'grid xl:grid-cols-[300px_1fr] gap-6 items-start mt-6' });
  const usersListCol = el('div', { class: 'space-y-3' }, spinner('Loading users...'));
  const planDetailCol = el('div', { class: 'bg-ink border border-line rounded-xl p-5 min-h-[400px]' }, 
    el('div', { class: 'text-neutral-500 text-sm flex items-center justify-center h-full' }, 'Select a user to view their plan')
  );
  
  mainGrid.append(usersListCol, planDetailCol);
  view.append(mainGrid);

  let exercises = [];
  try {
    exercises = await api.exercises();
  } catch (e) {
    console.error("Failed to load exercises for dropdowns", e);
  }

  async function loadUsers() {
    try {
      const res = await fetch(`${API_BASE}/admin/api/users`);
      if (!res.ok) throw new Error('Failed to fetch users');
      const users = await res.json();
      
      usersListCol.innerHTML = '';
      if (users.length === 0) {
        usersListCol.append(el('div', { class: 'text-sm text-neutral-400' }, 'No users found.'));
        return;
      }
      
      users.forEach(u => {
        const item = el('div', { 
          class: 'p-3 rounded-lg border border-line bg-[#161814] cursor-pointer hover:border-accent transition-colors',
          onclick: () => selectUser(u.id, u.email, item)
        },
          el('div', { class: 'text-sm font-medium text-neutral-200 truncate' }, u.display_name || u.email),
          el('div', { class: 'text-[11px] text-neutral-500 mt-1 truncate' }, u.id)
        );
        usersListCol.append(item);
      });
    } catch (e) {
      usersListCol.replaceChildren(errorBox(e));
    }
  }

  async function selectUser(userId, userEmail, itemEl) {
    usersListCol.querySelectorAll('div').forEach(d => d.classList.remove('border-accent'));
    if (itemEl) itemEl.classList.add('border-accent');
    
    planDetailCol.innerHTML = '';
    planDetailCol.append(spinner(`Loading plan for ${userEmail}...`));
    
    try {
      const res = await fetch(`${API_BASE}/admin/api/users/${userId}/plan`);
      if (!res.ok) {
          if (res.status === 404) throw new Error('No plan found for this user.');
          throw new Error('Failed to fetch plan');
      }
      const plan = await res.json();
      renderUserPlan(userId, userEmail, plan, planDetailCol);
    } catch (e) {
      planDetailCol.replaceChildren(errorBox(e));
    }
  }

  function renderUserPlan(userId, userEmail, plan, container) {
    container.innerHTML = '';
    
    const progressBtn = button('View Progress', 'outline', 'sm');
    progressBtn.onclick = () => renderUserProgress(userId, userEmail, plan, container);

    container.append(el('div', { class: 'flex items-center justify-between mb-6' },
      el('div', {},
        el('h2', { class: 'text-lg font-bold text-white' }, `Plan for ${userEmail}`),
        el('div', { class: 'text-xs text-neutral-400 mt-1' }, `Plan ID: ${plan.id}`)
      ),
      progressBtn
    ));
    
    let fitnessNode = (plan.fitness_nodes || []).find(n => n.node_type === 'weekly_workout_schedule');
    if (!fitnessNode || !fitnessNode.days) {
      container.append(el('div', { class: 'text-sm text-neutral-400' }, 'No weekly workout schedule found in this plan.'));
      return;
    }
    
    const daysWrap = el('div', { class: 'space-y-6' });
    fitnessNode.days.forEach(dayInfo => {
      daysWrap.append(renderDayCard(userId, dayInfo));
    });
    
    container.append(daysWrap);
  }

  function renderDayCard(userId, dayInfo) {
    const isRest = (dayInfo.workout_focus || '').toLowerCase().includes('rest');
    
    const exList = el('div', { class: 'mt-3 space-y-2' });
    
    // State for editing
    let currentExercises = (dayInfo.main_workout || []).map(ex => ({
      name: ex.exercise,
      sets: ex.sets || 3,
      reps: ex.reps || 10,
      rest_time: ex.rest_time || 60
    }));
    
    function drawExercises(editMode = false) {
      exList.innerHTML = '';
      
      if (!editMode) {
        if (currentExercises.length === 0) {
           exList.append(el('div', { class: 'text-xs text-neutral-500 italic' }, 'No exercises / Rest day'));
        } else {
           currentExercises.forEach(ex => {
             exList.append(el('div', { class: 'flex justify-between items-center py-2 border-b border-line/50 text-sm' },
               el('span', { class: 'text-neutral-200' }, ex.name),
               el('span', { class: 'text-neutral-500 text-xs' }, `${ex.sets} sets × ${ex.reps} reps (${ex.rest_time}s rest)`)
             ));
           });
        }
        return;
      }
      
      // Edit mode
      currentExercises.forEach((ex, i) => {
        const row = el('div', { class: 'flex gap-2 items-center bg-[#111310] p-2 rounded border border-line' });
        
        const sel = el('select', { class: 'flex-1 bg-ink border border-line rounded px-2 py-1.5 text-xs text-white' },
           el('option', { value: ex.name }, ex.name)
        );
        exercises.forEach(catEx => {
          if (catEx.name !== ex.name) {
             sel.append(el('option', { value: catEx.name }, catEx.name));
          }
        });
        sel.value = ex.name;
        sel.onchange = (e) => currentExercises[i].name = e.target.value;
        
        const setsInp = el('input', { type: 'number', class: 'w-14 bg-ink border border-line rounded px-2 py-1.5 text-xs text-center', value: ex.sets });
        setsInp.onchange = (e) => currentExercises[i].sets = parseInt(e.target.value) || 1;
        
        const repsInp = el('input', { type: 'number', class: 'w-14 bg-ink border border-line rounded px-2 py-1.5 text-xs text-center', value: ex.reps });
        repsInp.onchange = (e) => currentExercises[i].reps = parseInt(e.target.value) || 1;
        
        const delBtn = el('button', { class: 'p-1.5 text-danger hover:bg-danger/10 rounded' }, icon('trash-2', 'w-3.5 h-3.5'));
        delBtn.onclick = () => {
           currentExercises.splice(i, 1);
           drawExercises(true);
        };
        
        row.append(sel, el('span', {class: 'text-xs text-neutral-500'}, 'sets:'), setsInp, el('span', {class: 'text-xs text-neutral-500'}, 'reps:'), repsInp, delBtn);
        exList.append(row);
      });
      
      const addBtn = el('button', { class: 'mt-2 text-xs text-accent flex items-center gap-1 py-1 px-2 rounded hover:bg-accent/10' }, icon('plus', 'w-3 h-3'), 'Add Exercise');
      addBtn.onclick = () => {
         currentExercises.push({ name: exercises[0]?.name || 'Squat', sets: 3, reps: 10, rest_time: 60 });
         drawExercises(true);
      };
      exList.append(addBtn);
    }
    
    drawExercises(false);
    
    const editBtn = button('Edit', 'outline', 'sm');
    const saveBtn = button('Save', 'primary', 'sm');
    const cancelBtn = button('Cancel', 'outline', 'sm');
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    
    editBtn.onclick = () => {
       editBtn.style.display = 'none';
       saveBtn.style.display = '';
       cancelBtn.style.display = '';
       drawExercises(true);
    };
    
    cancelBtn.onclick = () => {
       editBtn.style.display = '';
       saveBtn.style.display = 'none';
       cancelBtn.style.display = 'none';
       // Revert
       currentExercises = (dayInfo.main_workout || []).map(ex => ({
          name: ex.exercise, sets: ex.sets || 3, reps: ex.reps || 10, rest_time: ex.rest_time || 60
       }));
       drawExercises(false);
    };
    
    saveBtn.onclick = async () => {
       saveBtn.disabled = true;
       saveBtn.textContent = 'Saving...';
       try {
         const payload = {
            day: dayInfo.day,
            workout_focus: dayInfo.workout_focus,
            exercises: currentExercises
         };
         
         const res = await fetch(`${API_BASE}/admin/api/users/${userId}/plan/day-workout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
         });
         
         if (!res.ok) throw new Error('Failed to save');
         
         // Update local state
         dayInfo.main_workout = currentExercises.map(ex => ({
            exercise: ex.name, sets: ex.sets, reps: ex.reps, rest_time: ex.rest_time
         }));
         
         editBtn.style.display = '';
         saveBtn.style.display = 'none';
         cancelBtn.style.display = 'none';
         drawExercises(false);
       } catch (e) {
         alert(e.message);
       } finally {
         saveBtn.disabled = false;
         saveBtn.textContent = 'Save';
       }
    };
    
    return card(
      el('div', { class: 'flex items-center justify-between' },
        el('div', { class: 'font-bold text-accent' }, dayInfo.day),
        el('div', { class: 'flex gap-2' }, editBtn, saveBtn, cancelBtn)
      ),
      el('div', { class: 'text-xs text-neutral-400 mt-1 mb-2 uppercase tracking-wide' }, dayInfo.workout_focus),
      exList
    );
  }

  async function renderUserProgress(userId, userEmail, plan, container) {
    container.innerHTML = '';
    const backBtn = button('Back to Plan', 'outline', 'sm');
    backBtn.onclick = () => renderUserPlan(userId, userEmail, plan, container);

    const resetBtn = button('Reset Today\'s Progress', 'primary', 'sm');
    resetBtn.onclick = async () => {
        if (!confirm("Are you sure you want to reset today's progress? This will delete the session.")) return;
        resetBtn.disabled = true;
        resetBtn.textContent = 'Resetting...';
        try {
            const res = await fetch(`${API_BASE}/admin/api/users/${userId}/progress/reset`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to reset');
            renderUserProgress(userId, userEmail, plan, container);
        } catch (e) {
            alert('Reset failed: ' + e.message);
            resetBtn.disabled = false;
            resetBtn.textContent = 'Reset Today\'s Progress';
        }
    };

    container.append(el('div', { class: 'flex items-center justify-between mb-6' },
      el('div', {},
        el('h2', { class: 'text-lg font-bold text-white' }, `Progress for ${userEmail}`)
      ),
      el('div', { class: 'flex gap-2' }, backBtn, resetBtn)
    ));

    const content = el('div', { class: 'space-y-4' }, spinner('Loading progress...'));
    container.append(content);

    try {
        const res = await fetch(`${API_BASE}/admin/api/users/${userId}/progress`);
        if (!res.ok) throw new Error('Failed to fetch progress');
        const sessions = await res.json();
        
        content.innerHTML = '';
        if (sessions.length === 0) {
            content.append(el('div', { class: 'text-sm text-neutral-400' }, 'No recent workout sessions found.'));
            return;
        }

        sessions.forEach(session => {
            const checklist = session.checklist || [];
            const exList = el('div', { class: 'mt-2 space-y-1' });
            
            if (checklist.length === 0) {
                 exList.append(el('div', { class: 'text-xs text-neutral-500 italic' }, 'No exercises recorded.'));
            } else {
                checklist.forEach(c => {
                    const isCompleted = c.completed;
                    exList.append(el('div', { class: 'flex justify-between items-center py-1.5 border-b border-line/30 text-sm' },
                       el('span', { class: isCompleted ? 'text-green-400 font-medium' : 'text-neutral-200' }, c.name || c.exercise_slug),
                       el('span', { class: 'text-neutral-400 text-xs' }, `${c.actual_reps || 0} reps total`)
                    ));
                });
            }

            // Make today's session highlighted
            const isToday = new Date().toISOString().split('T')[0] === session.date;
            content.append(card(
                el('div', { class: 'flex justify-between items-center' },
                   el('div', { class: 'font-bold ' + (isToday ? 'text-accent' : 'text-neutral-300') }, 
                      session.date ? new Date(session.date).toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'}) : 'Unknown Date'),
                   isToday ? el('span', { class: 'text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full uppercase' }, 'Today') : ''
                ),
                exList
            ));
        });
    } catch (e) {
        content.replaceChildren(errorBox(e));
    }
  }

  loadUsers();
}
