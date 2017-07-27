const h = require('react-hyperscript');
const Tooltip = require('../tooltip');
const Toggle = require('../toggle');

module.exports = function({ controller, document }){
  let btns = [];

  if( document.editable() ){
    btns.push(
      h(Tooltip, { description: 'Add entity', shortcut: 'e' }, [
        h('button.editor-button.plain-button', { onClick: () => controller.addElement() }, [
          h('i.material-icons', 'add_circle')
        ])
      ])
    );

    if( controller.allowDisconnectedInteractions() ){
      btns.push(
        h(Tooltip, { description: 'Add interaction', shortcut: 'i' }, [
          h('button.editor-button.plain-button', { onClick: () => controller.addInteraction() }, [
            h('i.material-icons', 'add_box')
          ])
        ])
      );
    }

    btns.push(
      h(Tooltip, { description: 'Delete selected', shortcut: 'del' }, [
        h('button.editor-button.plain-button', { onClick: () => controller.removeSelected() }, [
          h('i.material-icons', 'clear')
        ])
      ]),
      h(Tooltip, { description: 'Toggle draw connections mode', shortcut: 'd' }, [
        h(Toggle, { className: 'editor-button plain-button', onToggle: () => controller.toggleDrawMode(), getState: () => controller.drawMode() }, [
          h('i.material-icons', 'keyboard_tab')
        ])
      ]),
      h(Tooltip, { description: 'Relayout', shortcut: 'l' }, [
        h('button.editor-button.plain-button', { onClick: () => controller.layout() }, [
          h('i.material-icons', 'shuffle')
        ])
      ])
    );
  }

  btns.push(
    h(Tooltip, { description: 'Fit', shortcut: 'f' }, [
      h('button.editor-button.plain-button', { onClick: () => controller.fit() }, [
        h('i.material-icons', 'zoom_out_map')
      ])
    ])
  );

  return h('div.editor-buttons', btns);
};