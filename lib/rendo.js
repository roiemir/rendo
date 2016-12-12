var oil = require('oil');

var binary = {
    "==": function (left, right) { return left == right; },
    "!=": function (left, right) { return left != right; },
    "<": function (left, right) { return left < right; },
    ">": function (left, right) { return left > right; },
    "<=": function (left, right) { return left <= right; },
    ">=": function (left, right) { return left >= right; },
    "<<": function (left, right) { return left >> right; },
    ">>": function (left, right) { return left << right; },
    "+": function (left, right) { return left != null ? (right != null ? left + right : left) : right; }, // preventing string operation with null to convert to "null"
    "-": function (left, right) { return left != null ? (right != null ? left - right : left) : -right; }, // preventing string operation with null to conert to NaN
    "*": function (left, right) { return left * right; },
    "/": function (left, right) { return left / right; },
    "%": function (left, right) { return left % right; }
};

var unary = {
    "!": function (argument) { return !argument; },
    "+": function (argument) { return +argument; },
    "-": function (argument) { return -argument; }
};

var expressions = {
    "?:": function (expression, model) {
        if (evaluate(expression.expression, model)) {
            return evaluate(expression.positive, model);
        }
        else {
            return evaluate(expression.negative, model);
        }
    },
    "?=": function (expression, model) {
        var value = evaluate(expression.expression, model);
        for (var i = 0; i < expression.options.length; i++) {
            var option = expression.options[i];
            if (evaluate(option.value, model)) {
                return evaluate(option.result, model);
            }
        }
        return evaluate(option.otherwise, model);
    },
    "f": function (expression, model) {
        var object = evaluate(expression.object, model);
        if (object) {
            return object[expression.field];
        }
        return null;
    },
    "i": function (expression, model) {
        return model.get(expression.identifier);
    },
    "b": function (expression, model) {
        return binary[expression.operator](evaluate(expression.left, model), evaluate(expression.right, model));
    },
    "u": function (expression, model) {
        return unary[expression.operator](evaluate(expression.argument, model));
    },
    "??": function (expression, model) {
        var left = evaluate(expression.left, model);
        if (left == null) {
            return evaluate(expression.right, model);
        }
        return left;
    },
    "&&": function (expression, model) {
        return evaluate(expression.left, model) && evaluate(expression.right, model);
    },
    "||": function (expression, model) {
        return evaluate(expression.left, model) || evaluate(expression.right, model);
    },
    "@": function (expression, model) {
        var sequence = evaluate(expression.sequence, model);
        if (sequence) {
            return sequence[evaluate(expression.key, model)];
        }
        return null;
    },
    "@:": function (expression, model) {
        var sequence = evaluate(expression.sequence, model);
        if (sequence) {
            return sequence.slice(evaluate(expression.start, model), evaluate(expression.end, model));
        }
        return null;
    },
    "s": function (expression, model) {
        return null;
    },
    "=": function (expression, model) {
        return null;
    }
};

var modifiers = {
    round: function (value) {
        return Math.round(value)
    },
    number: function (value) {
        var f = parseFloat(value);
        if (!isNaN(f)) {
            var s = f.toString();
            var p = s.indexOf('.');
            var i = p > 0 ? s.slice(0, p) : s;
            var n = i.length - 3;
            while (n > 0) {
                i = i.slice(0, n) + ',' + i.slice(n);
                n -= 3;
            }
            return p > 0 ? i + s.slice(p) : i;
        }
        return "";
    }
};

function extend(source, obj) {
    if (source) {
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                obj[key] = source[key];
            }
        }
    }
    return obj;
}

function evaluate(expression, model) {
    while (expression && expression["!exp"]) {
        if (expression.$x) {
            // Expression loop
            expression = null;
        }
        else {
            expression.$x = true;
            var r = expressions[expression["!exp"]](expression, model);
            expression.$x = false;
            expression = r;
        }
    }
    if (expression && expression["!type"]) {
        var modifier = modifiers[expression["!type"]];
        if (modifier) {
            var init = expression["!init"];
            return modifier(init && init.length > 0 ? evaluate(init[0], model) : null);
        }
        return null;
    }
    return expression;
}

function isNotWhitespace(ch) {
    return !(ch === ' ' || ch === '\r' || ch === '\t' ||
    ch === '\n' || ch === '\v' || ch === '\u00A0');
}

function isNotIdentifier(ch) {
    return !('a' <= ch && ch <= 'z' ||
    'A' <= ch && ch <= 'Z' ||
    '_' === ch || ch === '$' || ch === '#');
}

function search(str, s, cb) {
    var i = 0;
    if (typeof s === "function") {
        cb = s;
    }
    else {
        i = s;
    }
    while (i < str.length && !cb(str[i])) {
        i++;
    }
    return i;
}

function Model(baseModel, model, parameters) {
    this.baseModel = baseModel;
    this.model = model;
    this.parameters = parameters;
}

Model.prototype.get = function (key) {
    if (key) {
        if (key[0] == '$') {
            var n = key.length === 1 ? 0 : parseInt(key.slice(1));
            if (this.parameters && n < this.parameters.length) {
                return evaluate(this.parameters[n], this);
            }
        }
        else if (typeof this.model === "object") {
            var v = this.model[key];
            if (v == null && this.baseModel != null) {
                return this.baseModel.get(key);
            }
            return v;
        }
    }

    return null;
};

function Rendo(template) {
    this.components = {};

    var components = oil.parse(template);

    for (var i = 0; i < components.length; i++) {
        var component = components[i];

        var name = component["!type"];
        if (name) {
            var render = component.render
                ? component.render
                : (component["!init"] && component["!init"].length > 0
                ? component["!init"][0]
                : (component["!ref"] || null));

            var scope = {};

            for (var key in component) {
                if (key[0] !== '!' && key !== "render") {
                    scope[key] = component[key];
                }
            }

            this.components[name] = {
                render: render,
                scope: scope
            };
        }
    }
}

Rendo.prototype.renderValue = function (value) {
    if (value != null && typeof value !== "object") {
        return "" + value;
    }
    return "";
};

Rendo.prototype.renderContents = function (contents, model) {
    var result = "";

    var s = 0;
    var o = contents.indexOf("{{");
    while (o >= s) {
        result += contents.slice(s, o);
        o += 2;

        var component = null;
        var fromModel = false;
        var i = search(contents, o, isNotWhitespace);

        if (contents[i] === ':' || contents[i] === '+') {
            fromModel = contents[i] == '+';
            o = i + 1;
            i = search(contents, o, isNotIdentifier);
            component = contents.slice(o, i);
        }

        // Reading to closing '}'
        var c = i;
        var count = 0;
        while (c < contents.length) {
            if (contents[c] === '{') {
                count++;
            }
            else if (contents[c] === '}') {
                if (count === 0) {
                    break;
                }
                count--;
            }
            c++;
        }


        var expressions = oil.parse(contents.slice(i, c));
        if (expressions.length > 0) {
            var models = evaluate(expressions[0], model);
            var parameters = expressions.slice(1);

            if (!models || models.constructor !== Array) {
                models = [models];
            }

            for (var m = 0; m < models.length; m++) {
                if (component) {
                    if (fromModel) {
                        var renderContents = model.get(component);
                        if (renderContents) {
                            result += this.renderContents(renderContents, new Model(model, models[m], [models[m]].concat(parameters)));
                        }
                    }
                    else {
                        result += this.render(component, new Model(model, models[m]), [models[m]].concat(parameters));
                    }
                }
                else {
                    result += this.renderValue(models[m]);
                }
            }
        }
        else if (component) {
            // Render same model
            if (fromModel) {
                var renderContents = model.get(component);
                if (renderContents) {
                    result += this.renderContents(renderContents, model);
                }
            }
            else {
                result += this.render(component, model);
            }
        }

        if (c === contents.length || contents[c + 1] != "}") {
            return result;
        }

        s = c + 2;
        o = contents.indexOf("{{", s);
    }

    if (s < contents.length) {
        result += contents.slice(s);
    }

    return result;
};

Rendo.prototype.render = function (componentName, model, parameters) {
    if (componentName == null) {
        return this.renderValue(model);
    }

    var component = this.components[componentName];
    if (!component) {
        return "";
    }

    var contents = component.render;
    if (!contents) {
        return "";
    }

    var models;
    if (model) {
        if (model.constructor === Array) {
            models = model;
        }
        else {
            models = [model];
        }
    }
    else {
        models = [null];
    }

    var result = "";
    for (var m = 0; m < models.length; m++) {
        var model = models[m];
        if (!model || model.constructor !== Model) {
            model = new Model(null, model);
        }

        result += this.renderContents(contents, new Model(model, component.scope, parameters));
    }
    return result;
};

Rendo.render = function (template, component, model) {
    return new Rendo(template).render(component, model);
};

module.exports = Rendo;