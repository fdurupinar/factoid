const React = require('react');
const ReactDom = require('react-dom');
const h = require('react-hyperscript');
const EventEmitter = require('eventemitter3');
const io = require('socket.io-client');
const _ = require('lodash');
const Promise = require('bluebird');
const logger = require('../../logger');
const makeCytoscape = require('./cy');
const Document = require('../../../model/document');
const debug = require('../../debug');
const defs = require('./defs');
const { getId, defer } = require('../../../util');
const Menu = require('./menu');
const Buttons = require('./buttons');

class Editor extends React.Component {
  constructor( props ){
    super( props );

    let docSocket = io.connect('/document');
    let eleSocket = io.connect('/element');

    let logSocketErr = (err) => logger.error('An error occurred during clientside socket communication', err);

    docSocket.on('error', logSocketErr);
    eleSocket.on('error', logSocketErr);

    let id = _.get( props, 'id' );
    let secret = _.get( props, 'secret' );

    let doc = new Document({
      socket: docSocket,
      factoryOptions: { socket: eleSocket },
      data: { id, secret }
    });

    if( debug.enabled() ){
      window.doc = doc;
    }

    let removeAllListeners = el => el.removeAllListeners();

    // just to make sure that we don't have dangling listeners causing issues
    doc.on('remove', ( el ) => removeAllListeners( el ));
    doc.on('replace', ( oldEl ) => removeAllListeners( oldEl ));

    let bus = new EventEmitter();

    bus.on('drawtoggle', () => this.toggleDrawMode());
    bus.on('addelement', data => this.addElement( data ));
    bus.on('remove', docEl => this.remove( docEl ));

    this.data = ({
      bus: bus,
      document: doc,
      drawMode: false,
      newElementShift: 0,
      allowDisconnectedInteractions: false,
      mountDeferred: defer(),
      initted: false
    });

    this.state = _.assign( {}, this.data );

    if( this.data.allowDisconnectedInteractions ){
      bus.on('addinteraction', data => this.addInteraction( data ));
    }

    logger.info('Checking if doc with id %s already exists', doc.id());

    Promise.try( () => doc.load() )
      .then( () => logger.info('The doc already exists and is now loaded') )
      .catch( err => {
        logger.info('The doc does not exist or an error occurred');
        logger.warn( err );

        return ( doc.create()
          .then( () => logger.info('The doc was created') )
          .catch( err => logger.error('The doc could not be created', err) )
        );
      } )
      .then( () => doc.synch(true) )
      .then( () => logger.info('Document synch active') )
      .then( () => {
        this.setData({ initted: true });

        logger.info('The editor is initialising');
      } )
      .then( () => this.data.mountDeferred.promise )
      .then( () => {
        let graphCtr = ReactDom.findDOMNode(this).querySelector('#editor-graph');

        this.data.cy = makeCytoscape({
          container: graphCtr,
          document: this.data.document,
          bus: this.data.bus,
          controller: this
        });

        logger.info('Initialised Cytoscape on mounted editor');
      } )
      .then( () => {
        logger.info('The editor has initialised');
      } )
      .catch( (err) => logger.error('An error occurred livening the doc', err) )
    ;
  }

  setData( obj, callback ){
    _.assign( this.data, obj );

    this.setState( obj, callback );
  }

  allowDisconnectedInteractions(){
    return this.data.allowDisconnectedInteractions;
  }

  editable(){
    return this.data.document.editable();
  }

  toggleDrawMode(){
    if( !this.editable() ){ return; }

    let on = !this.drawMode();

    this.data.bus.emit( on ? 'drawon' : 'drawoff' );

    return new Promise( resolve => this.setData({ drawMode: on }, resolve) );
  }

  drawMode(){
    return this.data.drawMode;
  }

  addElement( data = {} ){
    if( !this.editable() ){ return; }

    let cy = this.data.cy;
    let pan = cy.pan();
    let zoom = cy.zoom();
    let getPosition = rpos => ({
      x: ( rpos.x - pan.x ) / zoom,
      y: ( rpos.y - pan.y ) / zoom
    });
    let shift = ( pos, delta ) => ({ x: pos.x + delta.x, y: pos.y + delta.y });
    let shiftSize = defs.newElementShift;
    let shiftI = this.data.newElementShift;
    let delta = { x: 0, y: shiftSize * shiftI };
    let pos = getPosition( shift( _.clone( defs.newElementPosition ), delta ) );

    this.setData({ newElementShift: (shiftI + 1) % defs.newElementMaxShifts });

    let doc = this.data.document;

    let el = doc.factory().make({
      data: _.assign( {
        type: 'entity',
        name: '',
        position: pos
      }, data )
    });

    return ( Promise.try( () => el.synch() )
      .then( () => el.create() )
      .then( () => doc.add(el) )
      .then( () => el )
    );
  }

  addInteraction( data = {} ){
    if( !this.editable() ){ return; }

    return this.addElement( _.assign({
      type: 'interaction',
      name: ''
    }, data) );
  }

  remove( docElOrId ){
    if( !this.editable() ){ return; }

    let doc = this.data.document;
    let docEl = doc.get( getId( docElOrId ) ); // in case id passed
    let rmPpt = intn => intn.has( docEl ) ? intn.remove( docEl ) : Promise.resolve();
    let allIntnsRmPpt = () => Promise.all( doc.interactions().map( rmPpt ) );
    let rmEl = () => doc.remove( docEl );

    Promise.try( allIntnsRmPpt ).then( rmEl );
  }

  layout(){
    if( !this.editable() ){ return; }

    this.data.bus.emit('layout');
  }

  fit(){
    this.data.bus.emit('fit');
  }

  removeSelected(){
    if( !this.editable() ){ return; }

    this.data.bus.emit('removeselected');
  }

  render(){
    let document = this.data.document;
    let controller = this;

    return h('div.editor' + ( this.state.initted ? '.editor-initted' : '' ), this.state.initted ? [
      h(Buttons, { controller, document }),
      //h(Menu, { document }),
      h('div.editor-graph#editor-graph')
    ] : []);
  }

  componentDidMount(){
    this.data.mountDeferred.resolve();
  }

  componentWillUnmount(){
    if( this.data.cy ){
      this.data.cy.destroy();
    }
  }
}

module.exports = Editor;
