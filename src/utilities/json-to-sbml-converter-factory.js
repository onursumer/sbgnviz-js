const libsbml = require('libsbmljs_stable');
const libsbmlInstance = libsbml();
var pkgVersion = require('../../package.json').version; // need info about sbgnviz to put in xml
var pkgName = require('../../package.json').name;
var prettyprint = require('pretty-data').pd;
var xml2js = require('xml2js');
var mapPropertiesBuilder = new xml2js.Builder({rootName: "nwt:mapProperties"});
var compoundExtensionBuilder = new xml2js.Builder({rootName: "nwt:extraInfo"});
var textUtilities = require('./text-utilities');
var classes = require('./classes');

module.exports = function () {
    var elementUtilities, graphUtilities, experimentalDataOverlay;
    var cy;

    var nodesToSbo = 
    {
        "rna": 278,
        "complex sbml": 253,
        "hypothetical complex": 289,
        "degradation": 291,
        "drug": 298,
        "gene": 243,
        "protein": 252,
        "ion": 327,
        "ion channel": 284,
        "phenotype sbml": 358,
        "receptor": 244,
        "simple molecule": 247, 
        "truncated protein": 248,
        "unknown molecule": 285,
        "and": 173,
        "or": 174,
        "not": 238,
        "unknown logical operator": 398
    }

    var reducedNotationEdge = 
    {
        "positive influence sbml": 171,
        "negative influence": 407,
        "reduced modulation": 344,
        "reduced stimulation": 411,
        "reduced trigger": 168,
        "unknown negative influence": 169,
        "unknown positive influence": 172,
        "unknown reduced stimulation": 170,
        "unknown reduced modulation": 342,
        "unknown reduced trigger": 205,
    }

    var modifierNotationEdge = 
    {
        "modulation": 594,
        "stimulation": 459,
        "catalysis": 13,
        "inhibition": 537,
        "trigger": 461,
        "unknown inhibition": 536,
        "unknown catalysis": 462, 
    }
    var twoOrThreeEdge = 
    {
        "consumption": 1,
        "production" : 1,
        "transport": 1,
        "transcription consumptio": 1,
        "transcription production": 1,
        "translation consumption": 1,
        "translation production": 1,
    }
  
    function jsonToSbml (param) {
        elementUtilities = param.elementUtilities;
        graphUtilities = param.graphUtilities;
        experimentalDataOverlay = param.experimentalDataOverlay;
        cy = param.sbgnCyInstance.getCy();
      }

    jsonToSbml.createSbml = function(filename) {
        var jsObj = jsonToSbml.buildJsObj(filename);
        return jsObj;
    }

    /*
        Here are the role strings:
        1 - substrate, 2 - product, 3 - sidesubstrate, 4 - sideproduct, 5 - modifier
        6 - activator, 7 - inhibitor
    */
    
    jsonToSbml.buildJsObj = function(filename){
        var edges = cy.edges();
        var nodes = cy.nodes();
        var sbmlDoc =  new libsbmlInstance.SBMLDocument(3, 2);
        var model = sbmlDoc.createModel()
        model.setId('model1');

        // Layout Information
        sbmlDoc.enablePackage(libsbmlInstance.LayoutExtension.prototype.getXmlnsL3V1V1(), 'layout', true);
        sbmlDoc.setPackageRequired('layout', false);
        const layoutPlugin = libsbmlInstance.castObject(model.findPlugin('layout'), libsbmlInstance.LayoutModelPlugin);
        const layout = layoutPlugin.createLayout();
        layout.setId("layout_1");
        const dim = layout.getDimensions();
        const box = cy.elements().boundingBox();
        dim.setWidth(box.w); dim.setHeight(box.h);

        // Create compartment
        for (let i = 0; i < nodes.length; i++)
        {
            var nodeClass = nodes[i]._private.data.class;
            if( nodeClass !== "compartment")
                continue;

            const comp = model.createCompartment()
            const compId = nodes[i]._private.data.id.replace(/-/g, "_");
            comp.setId(compId)
            // TODO: Implement Units
            var simulationData = nodes[i].data("simulation");
            if(simulationData){
                if(simulationData["size"])
                    comp.setSize(simulationData["size"]);
                if(simulationData["constant"] !== null)
                    comp.setConstant(simulationData["constant"]);
                if(simulationData["spatialDimensions"] !== null)
                    comp.setSpacialDimension(simulationData["spatialDimensions"]);
            }
            if(nodes[i]._private.data.label)
                comp.setName(nodes[i]._private.data.label)

            // Add Layout Info for Compartment
            const glyph = layout.createCompartmentGlyph();
            glyph.setId(compId + '_glyph');
            glyph.setCompartmentId(compId);
            let box = {x: 0, y: 0, w: 0, h: 0};
            box.x = nodes[i].position().x; box.y = nodes[i].position().y;
            box.w = nodes[i].width(); box.h = nodes[i].height();
            let bb = glyph.getBoundingBox();
            bb.setX(box.x - box.w / 2); bb.setY(box.y - box.h / 2);
            bb.width = box.w; bb.height = box.h;
        }

        // Set species
        let infoId = 1;
        let defaultNeeded = false;
        for (let i = 0; i < nodes.length; i++)
        {
            var nodeClass = nodes[i]._private.data.class;
            let active = false, hypothetical = false, multimer = false;
            if(nodeClass.includes('active')){
                nodeClass = nodeClass.replace('active', '');
                active = true;
            }
            if(nodeClass.includes('hypothetical')){
                nodeClass = nodeClass.replace('hypothetical', '');
                hypothetical = true;
            }
            if(nodeClass.includes('multimer')){
                nodeClass = nodeClass.replace('multimer', '');
                multimer = true;
            }
            nodeClass = nodeClass.trim();

            if(!jsonToSbml.isSpecies(nodeClass))
                continue;

            var newSpecies = model.createSpecies();
            if(nodesToSbo[nodeClass])
            {
                newSpecies.setSBOTerm(nodesToSbo[nodeClass])
            }
            
            let parent = nodes[i].parent();
            while(parent.length > 0 && parent.data('class') !== 'compartment'){
                parent = parent.parent();
            }
            
            if(parent.length > 0 && parent.data('class') === 'compartment'){
                newSpecies.setCompartment(parent.id().replace(/-/g, "_"));
            }
            else{
                defaultNeeded = true;
                newSpecies.setCompartment('default');
            }

            var simulationData = nodes[i].data("simulation");
            if(simulationData){
                if(simulationData["hasOnlySubstanceUnits"] !== null)
                    newSpecies.setHasOnlySubstanceUnits(simulationData["hasOnlySubstanceUnits"]);
                if(simulationData["initialAmount"] !== null && simulationData["hasOnlySubstanceUnits"])
                    newSpecies.setInitialAmount(simulationData["initialAmount"]);
                if(simulationData["initialConcentration"] !== null && !simulationData["hasOnlySubstanceUnits"])
                    newSpecies.setInitialConcentration(simulationData["initialConcentration"]);
                if(simulationData["boundaryCondition"] !== null)
                    newSpecies.setBoundaryCondition(simulationData["boundaryCondition"]);
                if(simulationData["constant"] !== null)
                    newSpecies.setConstant(simulationData["constant"]);
            }

            const new_id = nodes[i].id();
            var newStr = new_id.replace(/-/g, "_"); //Replacing - with _ because libsml doesn't allow - in id
            newSpecies.setId(newStr);
            if(nodes[i]._private.data.label)
            {
                newSpecies.setName(nodes[i]._private.data.label)
            }

            // Add Layout Info for Species
            const glyph = layout.createSpeciesGlyph();
            glyph.setId(newStr + '_glyph');
            glyph.setSpeciesId(newStr);
            let box = {x: 0, y: 0, w: 0, h: 0};
            let bb = glyph.getBoundingBox();
            box.x = nodes[i].position().x; box.y = nodes[i].position().y;
            box.w = nodes[i].width(); box.h = nodes[i].height();
            bb.setX(box.x - box.w / 2); bb.setY(box.y - box.h / 2);
            bb.width = box.w; bb.height = box.h;

            // Add State Info for Species as Annotation
            if(!active && !hypothetical && !multimer && nodes[i].data('statesandinfos').length == 0)
                continue;
            
            let annotationString = '<nwt:extension xmlns:nwt="https://newteditor.org/">';
            annotationString += '<nwt:info nwt:multimer="' + multimer + '" nwt:active="' + active + 
                                    '" nwt:hypothetical="' + hypothetical + '" nwt:infoid="info_' + infoId +
                                    '" nwt:id="' + newSpecies.getId() + '">';
            for(let item of nodes[i].data('statesandinfos')){
                let boundingBox = item.bbox;
                let absoluteCoords = classes.AuxiliaryUnit.getAbsoluteCoord(item, cy);
                let boundingBoxStr =  'nwt:x="' + (absoluteCoords.x - boundingBox.w / 2) + '" nwt:y="' + (absoluteCoords.y - boundingBox.h / 2) + 
                                    '" nwt:w="' + boundingBox.w + '" nwt:h="' + boundingBox.h + '"';
                if(item.clazz == "residue variable"){
                    annotationString += '<nwt:residuevariable ' + boundingBoxStr + '>' + item.residue.variable + '</nwt:residuevariable>';
                }
                else if(item.clazz == "binding region"){
                    annotationString += '<nwt:bindingregion ' + boundingBoxStr + '>' + item.region.variable + '</nwt:bindingregion>';
                }
                else if(item.clazz == "unit of information"){
                    annotationString += '<nwt:unitinfo ' + boundingBoxStr + '>' + item.label.text + '</nwt:unitinfo>';
                }
            }
            annotationString += '</nwt:info>'
            annotationString += '</nwt:extension>'
            infoId += 1;
            newSpecies.setAnnotation(annotationString);
        }

        // The right hand side of -> denotes the type in the syntax below.
        // Building process array: {process: processNode -> cy node, sources: [sourceEdges] -> list[cy edge], 
        //                      targets: [targetEdges]: list[cy edge], modifiers: [modifierEdges] -> list[cy edge]}
        let processes = [];
        nodes.forEach(function (ele, i) {
            var eleClass = ele.data('class')
                .replace('active', '')
                .replace('hypothetical', '')
                .replace('multimer', '')
                .trim();

            if(!jsonToSbml.isProcessNode(eleClass))
                return;

            var connectedEdges = ele.connectedEdges();
            let sources = [], targets = [], modifiers = [];
            let eleId = ele.id();
            connectedEdges.forEach(function (edge) {
                if(edge.source().id() == eleId){
                    targets.push(edge);
                    return;
                }
                if(jsonToSbml.isModifier(edge.data('class'))){
                    if(!jsonToSbml.isLogicalOperatorNode(edge.source().data('class')))
                        modifiers.push(edge);
                    return;
                }
                sources.push(edge);
            });
            processes.push({"process": ele, "sources": sources, "targets": targets, "modifiers": modifiers});
        })

        for(let [i, processArray] of processes.entries()){
            let process = processArray.process;
            let processClass = process.data('class');
            let processId = process.id().replace(/-/g, '_');
            
            var rxn = model.createReaction();
            rxn.setId('process_'+ processId);
            rxn.setReversible(false);

            // Parent Info
            let parent = process.parent();
            while(parent.length > 0 && parent.data('class') !== 'compartment'){
                parent = parent.parent();
            }
            
            if(parent.length > 0 && parent.data('class') === 'compartment'){
                rxn.setCompartment(parent.id().replace(/-/g, "_"));
            }
            else{
                defaultNeeded = true;
                rxn.setCompartment('default');
            }
            
            for(let sourceEdge of processArray.sources){
                let sourceId = sourceEdge.source().id().replace(/-/g, '_');
                const spr1 = rxn.createReactant();
                spr1.setSpecies(sourceId);
                spr1.setStoichiometry( (sourceEdge.data("simulation")["stoichiometry"] || "") );
                spr1.setConstant(true);
            }
            
            for(let targetEdge of processArray.targets){
                let targetId = targetEdge.target().id().replace(/-/g, '_');
                const spr2 = rxn.createProduct();
                spr2.setSpecies(targetId);
                spr2.setStoichiometry( (targetEdge.data("simulation")["stoichiometry"] || "") );
                spr2.setConstant(true);
            }
            
            for(let modifierEdge of processArray.modifiers){
                let modifierId = modifierEdge.source().id().replace(/-/g, '_');
                const modifier = rxn.createModifier();
                modifier.setSpecies(modifierId);
                modifier.setSBOTerm(modifierNotationEdge[modifierEdge.data('class')]);
            }

            //Set sbo term for reaction
            let sourceEdgeClass = 'undefined', targetEdgeClass = 'undefined';
            if(processArray.sources[0])
                sourceEdgeClass = processArray.sources[0].data('class');
            if(processArray.targets[0])
                targetEdgeClass = processArray.targets[0].data('class');

            if((sourceEdgeClass == "consumption" || sourceEdgeClass == "undefined") 
                && (targetEdgeClass == "production" || targetEdgeClass == "undefined") 
                && processClass == "process")
                rxn.setSBOTerm(176);
            else if((sourceEdgeClass == "consumption" || sourceEdgeClass == "undefined") 
                && (targetEdgeClass == "production" || targetEdgeClass == "undefined") 
                && processClass == "omitted process")
                rxn.setSBOTerm(397);
            else if((sourceEdgeClass == "consumption" || sourceEdgeClass == "undefined") 
                && (targetEdgeClass == "production" || targetEdgeClass == "undefined") 
                && processClass == "uncertain process")
                rxn.setSBOTerm(396);
            else if(processClass == "truncated process")
                rxn.setSBOTerm(178);
            else if(processClass == "association")  
                rxn.setSBOTerm(177)
            else if(processClass == "dissociation")  
                rxn.setSBOTerm(180)
            else if(sourceEdgeClass == "transcription consumption" || targetEdgeClass == "transcription production")
                rxn.setSBOTerm(183);
            else if(sourceEdgeClass == "translation consumption" || targetEdgeClass == "translation production")
                rxn.setSBOTerm(184);
            else if(targetEdgeClass == "transport")
                rxn.setSBOTerm(185);
            else
                rxn.setSBOTerm(176);
            
            console.log("WE ARE HERE");
            for(var lp in process.data("simulation")["localParameters"]){
                var localp = rxn.createLocalParameter();
                localp.setValue(lp.quantity);
                localp.setName(lp.name.replace(/-/g, '_'));
            }
            console.log("WE ARE HERE 2");
            const k1 = rxn.createKineticLaw();
            const parser = new libsbml.SBMLFormulaParser();
            const kmath = parser.parseL3Formula( (process.data("simulation")["kineticLaw"].replace(/-/g, '_') || "") );
            k1.setMath(kmath);
            console.log("WE ARE HERE 3");
            // Add Layout Info for Processes
            const glyph = layout.createReactionGlyph();
            glyph.setId("process_" + (i+1));
            glyph.setReactionId(rxn.getId());
            var lineSegment = glyph.createLineSegment();
            var bbox = process.data('bbox');
            bbox.x = process.position().x; bbox.y = process.position().y;

            var ports1 = process.data('ports')[0], ports2 = process.data('ports')[1];
            let direction = "L-to-R";
            let portZeroIsInput = false, portOneIsInput = false;
            process.connectedEdges().forEach(function(ele) {
                if(portZeroIsInput || portOneIsInput || !ele.data('porttarget'))
                    return;
                portZeroIsInput = ele.data('porttarget').endsWith('.1');
                portOneIsInput = ele.data('porttarget').endsWith('.2');
            });

            if((portZeroIsInput && ports1.x < 0) || (portOneIsInput && ports1.x > 0))
                direction = "L-to-R";
            else if((portZeroIsInput && ports1.x > 0) || (portOneIsInput && ports1.x < 0))
                direction = "R-to-L";
            else if((portZeroIsInput && ports1.y < 0) || (portOneIsInput && ports1.y > 0))
                direction = "T-to-B";
            else if((portZeroIsInput && ports1.y > 0) || (portOneIsInput && ports1.y < 0))
                direction = "B-to-T";

            let startX, startY, endX, endY;
            if(direction == "L-to-R"){
                startX = bbox.x - bbox.w / 2; startY = bbox.y;
                endX = bbox.x + bbox.w / 2; endY = bbox.y;
            }
            else if(direction == "R-to-L"){
                startX = bbox.x + bbox.w / 2; startY = bbox.y;
                endX = bbox.x - bbox.w / 2; endY = bbox.y;
            }
            else if(direction == "B-to-T"){
                startX = bbox.x; startY = bbox.y + bbox.h / 2;
                endX = bbox.x; endY = bbox.y - bbox.h / 2;
            }
            else{
                startX = bbox.x; startY = bbox.y - bbox.h / 2;
                endX = bbox.x; endY = bbox.y + bbox.h / 2;
            }
            var start = lineSegment.getStart(); start.setX(startX); start.setY(startY);
            var end = lineSegment.getEnd(); end.setX(endX); end.setY(endY);

            for(let j = 0; j < processArray.sources.length; j++){
                let substrate = processArray.sources[j];
                let substrateId = substrate.source().id().replace(/-/g, '_');
                const referenceGlyph = glyph.createSpeciesReferenceGlyph();
                referenceGlyph.setSpeciesGlyphId(substrateId + '_glyph');
                referenceGlyph.setRole(1);
                referenceGlyph.setId("substrate_" + (i+1) + "_" + (j+1));

                var lineSegment = referenceGlyph.createLineSegment();
                var lineStart = substrate.sourceEndpoint();
                var lineEnd = substrate.targetEndpoint();
                var start = lineSegment.getStart(); start.setX(lineStart.x); start.setY(lineStart.y);
                var end = lineSegment.getEnd(); end.setX(lineEnd.x); end.setY(lineEnd.y);
            }

            for(let j = 0; j < processArray.targets.length; j++){
                let product = processArray.targets[j];
                let productId = product.target().id().replace(/-/g, '_');
                const referenceGlyph = glyph.createSpeciesReferenceGlyph();
                referenceGlyph.setSpeciesGlyphId(productId + '_glyph');
                referenceGlyph.setRole(2);
                referenceGlyph.setId("product_" + (i+1) + "_" + (j+1));

                var lineSegment = referenceGlyph.createLineSegment();
                var lineStart = product.sourceEndpoint();
                var lineEnd = product.targetEndpoint();
                var start = lineSegment.getStart(); start.setX(lineStart.x); start.setY(lineStart.y);
                var end = lineSegment.getEnd(); end.setX(lineEnd.x); end.setY(lineEnd.y);
            }

            for(let j = 0; j < processArray.modifiers.length; j++){
                let modifier = processArray.modifiers[j];
                let modifierId = modifier.source().id().replace(/-/g, '_');
                const referenceGlyph = glyph.createSpeciesReferenceGlyph();
                referenceGlyph.setSpeciesGlyphId(modifierId + '_glyph');
                referenceGlyph.setRole(5);
                referenceGlyph.setId("modifier_" + (i+1) + "_" + (j+1));

                var lineSegment = referenceGlyph.createLineSegment();
                var lineStart = modifier.sourceEndpoint();
                var lineEnd = modifier.targetEndpoint();
                var start = lineSegment.getStart(); start.setX(lineStart.x); start.setY(lineStart.y);
                var end = lineSegment.getEnd(); end.setX(lineEnd.x); end.setY(lineEnd.y);
            }
        }

        // Add default compartment
        if(defaultNeeded){
            const defaultCompartment = model.createCompartment();
            defaultCompartment.setId('default');
            defaultCompartment.setSize(1);
            defaultCompartment.setConstant(true);
        }

        // Building reduced process array: {edge: edge arc -> cy edge, source: source node -> cy node, 
        //                      target: target node: cy node}
        let reducedProcesses = [];
        edges.forEach(function (ele) {
            if(!jsonToSbml.isReducedArc(ele.data('class'))){
                return;
            }
            if(jsonToSbml.isLogicalOperatorNode(ele.source().data('class'))){
                return;
            }
            reducedProcesses.push({edge: ele, source: ele.source(), target: ele.target()});
        });

        for(let [i, reducedProcessArray] of reducedProcesses.entries()){
            var edgeId = reducedProcessArray.edge.id().replace(/-/g, '_');
            var sourceId = reducedProcessArray.source.id().replace(/-/g, '_');
            var targetId = reducedProcessArray.target.id().replace(/-/g, '_');
            console.log(reducedProcessArray.target);
            const rxn = model.createReaction()
            rxn.setId('reduced_'+ edgeId);
            rxn.setSBOTerm(reducedNotationEdge[reducedProcessArray.edge.data('class')])
        
            const spr1 = rxn.createReactant()
            spr1.setSpecies(sourceId);
        
            const spr2 = rxn.createProduct()
            spr2.setSpecies(targetId);

            // Layout Info for Reduced Process
            const glyph = layout.createReactionGlyph();
            glyph.setId("reduced_" + (i+1));
            glyph.setReactionId(rxn.getId());

            // Modifier
            const referenceGlyph = glyph.createSpeciesReferenceGlyph();
            referenceGlyph.setSpeciesGlyphId(sourceId + '_glyph');
            referenceGlyph.setRole(5);
            referenceGlyph.setId("reduced_modulator_" + (i+1));

            var lineSegment = referenceGlyph.createLineSegment();
            var lineStart = reducedProcessArray.edge.sourceEndpoint();
            var lineEnd = reducedProcessArray.edge.targetEndpoint();
            var start = lineSegment.getStart(); start.setX(lineStart.x); start.setY(lineStart.y);
            var end = lineSegment.getEnd(); end.setX(lineEnd.x); end.setY(lineEnd.y);

            // Product
            const referenceGlyph2 = glyph.createSpeciesReferenceGlyph();
            referenceGlyph2.setSpeciesGlyphId(  + '_glyph');
            referenceGlyph2.setRole(5);
            referenceGlyph2.setId("reduced_product_" + (i+1));
        }

        const writer = new libsbmlInstance.SBMLWriter()
        const serializedSBML = writer.writeSBMLToString(sbmlDoc)

        libsbmlInstance.destroy(sbmlDoc)
        libsbmlInstance.destroy(writer)
        return serializedSBML;
    }
    
    jsonToSbml.buildReactions = function(model) {}
    jsonToSbml.isProcessNode = function(nodeClass) {
        return nodeClass.endsWith("process") || nodeClass == "association" || nodeClass == "dissociation";
    }
    jsonToSbml.isLogicalOperatorNode = function(nodeClass) {
        return nodeClass == "and" || nodeClass == "not" || nodeClass == "or" || nodeClass == "unknown logical operator"
    }
    jsonToSbml.isSpecies = function(nodeClass) {
        return !jsonToSbml.isLogicalOperatorNode(nodeClass) && !jsonToSbml.isProcessNode(nodeClass)
        &&  nodeClass != "compartment";
    }
    jsonToSbml.isModifier = function(edgeClass) {
        if(modifierNotationEdge[edgeClass])
            return true;
        return false;
    }
    jsonToSbml.isReducedArc = function(edgeClass) {
        if(reducedNotationEdge[edgeClass])
            return true;
        return false;
    }
    jsonToSbml.buildString = function(obj) {}
    jsonToSbml.getRenderExtensionSbgnml = function(renderInfo) {}
    jsonToSbml.getAnnotationExtension = function(cyElement) {}
    jsonToSbml.getGlyphSbgnml = function(node, version, visible = true){}
    jsonToSbml.getOrCreateExtension = function(element) {}
    jsonToSbml.getArcSbgnml = function(edge, version, hidden = false){}
    jsonToSbml.addGlyphBbox = function(node){}
    jsonToSbml.addStateAndInfoBbox = function(node, boxGlyph){}
    jsonToSbml.addStateBoxGlyph = function(node, id, mainGlyph){}
    jsonToSbml.addBindingBoxGlyph = function(node, id, mainGlyph){}
    jsonToSbml.addResidueBoxGlyph = function(node, id, mainGlyph){}
    jsonToSbml.addInfoBoxGlyph = function (node, id, mainGlyph) {}
    jsonToSbml.childOfNone = function(ele, nodes) {}
    return jsonToSbml;
}
