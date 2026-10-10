/* Runs in <head>, before the first paint: tells the stylesheet that scripts are on.
   The hero name and role are pre-rendered for readers without JavaScript ; with it, they are
   held back until script.js is ready to type them, so that they do not flash in full first. */
document.documentElement.classList.add('js');
