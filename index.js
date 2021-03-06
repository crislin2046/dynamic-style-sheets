import {generateUniquePrefix, prefixAllRules} from '../maskingtape.css/c3s.js';
import {addInsertListener, addRemovedListener, monitorChanges} from './monitorChanges.js';
const stylistFunctions = new Map();
const mappings = new Map();
const memory = {state: {}};
let initialized = false;

export function setState(newState) {
  const clonedState = clone(newState);
  Object.assign(memory.state,clonedState);
}

export function restyleElement(el) {
  if ( ! el ) return;
  el.classList.forEach(className => className.startsWith('c3s') && restyleClass(className));
}

export function restyleClass(className) {
  const {element,stylist} = mappings.get(className);
  associate(className, element, stylist, memory.state);
}

export function restyleAll() {
  mappings.forEach(({element,stylist}, className) => {
    associate(className, element, stylist, memory.state);
  });
}

export function initializeDSS(state, functionsObject) {
  setState(state);
  /** 
    to REALLY prevent FOUC put this style tag BEFORE any DSS-styled markup
    and before any scripts that add markup, 
    and before the initializeDSS call
  **/
  if ( ! document.querySelector('[data-role="prevent-fouc"]') ) {
    document.head.insertAdjacentHTML('beforeend', `
      <style data-role="prevent-fouc">
        [stylist]:not([associated]) {
          display: none !important;
        }
      </style>
    `);
  }
  addMoreStylistFunctions(functionsObject); 
  addInsertListener(associateStylistFunctions);
  addRemovedListener(unassociateStylistFunctions);
  monitorChanges();
  if ( ! initialized ) {
    const initialEls = Array.from(document.querySelectorAll('[stylist]'));
    associateStylistFunctions(...initialEls);
    initialized = true;
  }

  return;

  function associateStylistFunctions(...els) {
    els = els.filter(el => el.hasAttribute('stylist'));
    if ( els.length == 0 ) return;
    for ( const el of els ) {
      const stylistNames = (el.getAttribute('stylist') || '').split(/\s+/g);
      for ( const stylistName of stylistNames ) {
        const stylist = stylistFunctions.get(stylistName);
        if ( ! stylist ) throw new TypeError(`Stylist named by ${stylistName} is unknown.`);
        const className = randomClass();
        el.classList.add(className);
        associate(className, el, stylist, state);
      }
    }
  }
}

// an object whose properties are functions that are stylist functions
export function addMoreStylistFunctions(functionsObject) {
  const toRegister = [];
  for ( const funcName of Object.keys(functionsObject) ) {
    const value = functionsObject[funcName];
    if ( typeof value !== "function" ) throw new TypeError("Functions object must only contain functions.");
    // this prevents a bug where we miss an existing style element in 
    // a check for a style element based on the stylist.name property
    if ( value.name !== funcName ) throw new TypeError(`Stylist function must be actual function named ${funcName} (it was ${value.name})`);

    // don't overwrite exisiting names
    if ( !stylistFunctions.has(funcName) ) {
      toRegister.push(() => stylistFunctions.set(funcName,value));
    }
  }
  while(toRegister.length) toRegister.pop()();
}

function randomClass() {
  const {prefix:[className]} = generateUniquePrefix();
  return className;
}

function associate(className, element, stylist, state) {
  const styleText = (stylist(element, state) || '');
  let styleElement = document.head.querySelector(`style[data-prefix="${className}"]`);
  let changes = false;
  let prefixed = true;
  let prefixedStyleText;

  if (!mappings.has(className)) {
    mappings.set(className, {element,stylist});
  }

  if ( !styleElement ) {
    prefixed = false;
    const styleMarkup = `
      <style data-stylist="${stylist.name}" data-prefix="${className}">
        ${styleText}
      </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styleMarkup);
    styleElement = document.head.querySelector(`style[data-prefix="${className}"]`);
  } else {
    if ( styleElement instanceof HTMLStyleElement ) {
      prefixedStyleText = Array.from(styleElement.sheet.cssRules)
        .filter(rule => !rule.parentRule)
        .map(rule => rule.cssText)
        .join('\n')
    }
  }

  // I don't know why this has to happen, but it does
  if ( styleElement.innerHTML != styleText ) {
    styleElement.innerHTML = styleText;
    changes = true;
  }

  // only prefix if we have not already
  if ( !prefixed || changes ) {
    if ( styleElement instanceof HTMLStyleElement ) {
      const styleSheet = styleElement.sheet;
      prefixAllRules(styleSheet, "." + className, '');
      element.setAttribute('associated', 'true');
      prefixedStyleText = Array.from(styleSheet.cssRules)
        .filter(rule => !rule.parentRule)
        .map(rule => rule.cssText)
        .join('\n')
      styleElement.innerHTML = prefixedStyleText;
    }
  }

}

function disassociate(className, element) {
  const styleSheet = document.querySelector(`style[data-prefix="${className}"]`); 
  mappings.delete(className);
  if ( styleSheet ) {
    element.classList.remove(className);
    styleSheet.remove();
  }
}

function unassociateStylistFunctions(...els) {
  els = els.filter(el => el.hasAttribute('stylist'));
  if ( els.length == 0 ) return;
  for ( const el of els ) {
    el.classList.forEach(className => className.startsWith('c3s') && disassociate(className, el));
  }
}

function clone(o) {
  return JSON.parse(JSON.stringify(o)); 
}
