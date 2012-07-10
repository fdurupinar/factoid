// this file contains integration with the model to the cytoscape.js visualisation

$(function(){
  var isTouchDevice = ('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch; // taken from modernizr 
	var $graph = $('#graph');

  $graph.cytoscape({
    style: $.cytoscape.stylesheet()
      .selector('node')
        .css({
          height: 40,
          width: 40,
          content: 'data(name)',
          textValign: 'center',
          textHalign: 'center',
          color: 'white',
          backgroundColor: '#888',
          textOutlineColor: '#888',
          textOutlineWidth: 2
        })
      .selector('node:selected')
        .css({
          borderWidth: 3,
          borderColor: '#fdb722'
        })
      .selector('node[type="interaction"], node.ui-cytoscape-edgehandles-preview')
        .css({
          height: 20,
          width: 20,
          shape: 'rectangle',
          content: ''
        })
      .selector('edge')
        .css({
          width: 2
        })

      // edgehandles css
      .selector(".ui-cytoscape-edgehandles-source")
        .css({
          "border-color": "#0094d6",
          "border-width": 3
        })
      .selector(".ui-cytoscape-edgehandles-target, node.ui-cytoscape-edgehandles-preview")
        .css({
          "background-color": "#0094d6",
          "text-outline-color": "#0094d6"
        })
      .selector("edge.ui-cytoscape-edgehandles-preview")
        .css({
          "line-color": "#0094d6"
        })
    ,

    ready: function( cy ){
      window.cy = cy;

      var json = cyutil.entities2json( doc.entities() );
      cy.add( json );
    }
  }); // cytocsape

  // inject arbor into the page
  // unfortunately, we need to do include it this way for webworkers to work properly
  $('head').append('<script type="text/javascript" src="/js/arbor.js"></script>');

  // add element to cytoscape when an element is added in the model
  doc.addEntity(function( entity ){
    var ele = cy.add({
      group: 'nodes',
      position: entity.viewport,
      data: {
        id: entity.id,
        name: entity.name,
        type: entity.type
      },
      classes: 'entity' + ( entity.interaction ? ' interaction' : '' )
    });
  });

  // remove element from cytoscape when its entity is removed from the model
  doc.removeEntity(function( entityId ){
    cy.getElementById(entityId).remove();
  });

  // code for keeping a record of updated node positions
  var movedNodes = [];
  var movedNode = {};
  function updateNodePosition( node ){
    var id = node.id();
    var alreadyHandled = movedNode[ id ];

    if( !alreadyHandled ){
      movedNodes.push( node );
      movedNode[ id ] = true;
    }
  }

  // update node positions in the model periodically
  setInterval(function(){
    // get the lists and set to empty so we're not handling more events as they come in
    var mNodes = movedNodes;
    var mNode = movedNode;
    movedNodes = [];
    movedNode = {};

    for( var i = 0; i < mNodes.length; i++ ){ // for each node
      var node = mNodes[i];
      var pos = node.position();
      var id = node.id();

      doc.entityViewport( id, pos );
    } 
  }, 1000/60); // 60 fps

  // when a node is moved, update its position
  $graph.cytoscape(function(e){
    cy.on('drag updateposition', 'node', function(){ // note: only on drag (otherwise we could get an infite loop with `position`)
      updateNodePosition(this);
    });
  });

  // when clicking an entity, highlight it
  $graph.cytoscape(function(e){
    cy
      .on('click', 'node', function(){
        var node = this;
        var id = node.data('id');
        var $entity = $( document.getElementById('entity-' + id) );

        $entity.addClass('highlighted');

        $('#info').scrollTo($entity, {
          duration: 250,
          axis: 'y',
          onAfter: function(){
            setTimeout(function(){
              $entity.removeClass('highlighted');
            }, 250);
          }
        });

      })
    ;
  });

  // add the panzoom control
  if( !isTouchDevice ){
    $graph.cytoscape(function(){
      $graph.cytoscapePanzoom();
    });
  }

  // add the edgehandles plugin
  $graph.cytoscape(function(){
    $graph.cytoscapeEdgehandles({
      preview: true,
      handleSize: 16,
      handleColor: "#0094d6",
      lineType: "straight", // can be "straight" or "draw"
      
      edgeType: function( sourceNode, targetNode ){
        var eitherIsInteraction = sourceNode.data('type') === 'interaction' || targetNode.data('type') === 'interaction';
        var alreadyConnected = eitherIsInteraction && sourceNode.edgesWith( targetNode ).size() !== 0;

        if( alreadyConnected ){
          return null; // => no edge to be added
        } else if( eitherIsInteraction ){
          return 'flat';
        } else {
          return 'node';
        }
      },
      
      loopAllowed: function( node ){
        return false;
      },
      
      nodeParams: function( sourceNode, targetNode ){
        return {
          classes: 'edgehandlestemp'
        };
      },
      
      edgeParams: function( sourceNode, targetNode ){
        return {
          classes: 'edgehandlestemp'
        };
      },

      start: function( sourceNode ){ // fired when edgehandles interaction starts (drag on handle)
        
      },

      // TODO document this callback a bit more, since the whole process is a bit complex
      complete: function( sourceNode, targetNodes, addedEles ){ // fired when edgehandles is done and entities are added
        var srcIsInteraction = sourceNode.hasClass('interaction');

        if( srcIsInteraction ){ // then each added ele is an edge and we just need to make connections
          var intNode = sourceNode;
          var intId = intNode.id();

          for( var i = 0; i < addedEles.length; i++ ){ // for each edge, make the connection
            var edge = addedEles[i];
            var entNode = edge.connectedNodes().not( intNode );
            var entId = entNode.id();

            doc.connectEntityToInteraction( entId, intId );
          }


        } else { // then the source is just an entity that we connect diff. interactions to
          var entNode = sourceNode;
          var entId = sourceNode.id();
          var newNodes = addedEles.nodes();
          var newEdges = addedEles.edges();

          // for each new node, make an interaction
          var newNodeId2Interaction = {};
          for( var i = 0; i < newNodes.length; i++ ){ 
            var newNode = newNodes[i];

            var interaction = doc.addInteraction({
              viewport: newNode.position()
            });
            newNodeId2Interaction[ newNode.id() ] = interaction;
          }

          // connect each new interaction to its two entities
          var edgeAlreadyDealtWith = {};
          for( var i = 0; i < newNodes.length; i++ ){ 
            var newNode = newNodes[i];
            var newNodeId = newNode.id();
            var interaction = newNodeId2Interaction[ newNodeId ];

            // new node => all edges were just added
            var connEdges = newNode.connectedEdges();

            // for each new edge, make a connection
            for( var j = 0; j < connEdges.length; j++ ){
              var edge = connEdges[j];

              // we're handling a new node => node connected to other edge must be a real entity
              var otherEntNode = edge.connectedNodes().not( newNode );
              var otherEntId = otherEntNode.id();

              // connect the interaction to the other entity
              doc.connectEntityToInteraction( otherEntId, interaction.id );
              edgeAlreadyDealtWith[ edge.id() ] = true;
            }
          }

          // (all unhandled (i.e. not dealth with) edges are not connected to new nodes)
          //  &&
          // (source node is entity)
          //  =>
          // (the unhandles edges are each connected to a real interaction node)
          for( var i = 0; i < newEdges.length; i++ ){
            var newEdge = newEdges[i];

            // only deal with edges we need to
            if( edgeAlreadyDealtWith[ newEdge.id() ] ){ continue; }

            var intNode = newEdge.connectedNodes().not( entNode );
            var intId = intNode.id();

            doc.connectEntityToInteraction( entId, intId );
          }
        }

        addedEles.remove(); // remove the added eles since they were just for show
      },

      stop: function( sourceNode ){ // fired when edgehandles interaction is stopped (either complete with added edges or incomplete)
        
      }
    });
  });

  // when the viewport is updated on the server, update its node position
  doc.entityViewport(function(entityId, viewport){
    cy.getElementById(entityId).position( viewport );
  });

  // update names when the doc changes
  doc.entityName(function(entityId, name){
    cy.getElementById( entityId ).data( 'name', name );
  });

  doc.connectEntityToInteraction(function(entityId, interactionId){
    cy.add({
      group: 'edges',
      data: {
        source: interactionId,
        target: entityId
      }
    });
  });

  doc.disconnectEntityFromInteraction(function(entityId, interactionId){
    var ent = cy.getElementById( entityId );
    var inter = cy.getElementById( interactionId );

    var edge = inter.edgesTo( ent );
    edge.remove();
  });
  
});