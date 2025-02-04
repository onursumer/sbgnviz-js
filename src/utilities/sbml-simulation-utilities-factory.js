module.exports = function () {
  var parameters = {}; // { id = str: { name = str, value = float, unit = str, constant = bool } }, 
  
  var cy;
  var sbmlSimulationUtilities = function (param) {
      cy = param.sbgnCyInstance.getCy();
  };

  sbmlSimulationUtilities.generateUUID = function () {
    // Public Domain/MIT
    var d = Date.now();
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      d += performance.now(); //use high-precision timer if available
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      }
    );
  };

  sbmlSimulationUtilities.generateParameterID = function() {
    return "param-" + sbmlSimulationUtilities.generateUUID();
  }

  sbmlSimulationUtilities.addParameter = function (name, value, unit, constant) {
    var id = sbmlSimulationUtilities.generateParameterID();
    parameters[id] = {
      name: name,
      value: value,
      unit: unit,
      constant: constant
    }
  }

  sbmlSimulationUtilities.removeParameter = function (id) {
    delete parameters[id];
  }

  sbmlSimulationUtilities.getParameters = function () {
    return Object.entries(parameters).map( ([id, {name, value, unit, constant}]) => ({
      id, name, value, unit, constant
    }));
  }

  sbmlSimulationUtilities.setParameter = function (id, field, value) {
    parameters[id][field] = value;
  }

  return sbmlSimulationUtilities;
};
  