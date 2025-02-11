const container = document.getElementById("container")

var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
var svgNS = svg.namespaceURI;

class Vector2{
    constructor(x, y){
        this.x = x
        this.y = y
    }

    add(v){
        return new Vector2(this.x + v.x, this.y + v.y)
    }

    sub(v){
        return new Vector2(this.x - v.x, this.y - v.y)
    }

    mul(f){
        return new Vector2(this.x * f, this.y * f)
    }

    div(f){
        return new Vector2(this.x / f, this.y / f)
    }

    dot(v){
        return this.x*v.x + this.y*v.y
    }

    mag(){
        return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2))
    }

    unit(){
        return this.div(this.mag())
    }
}

function clamp(x, min, max){
    if (x < min){
        return min
    }

    if (x > max){
        return max
    }

    return x
}

function projectPoly(axis, vertices){
    let min = axis.dot( vertices[0] )
    let max = min

    // Due to the cyclist nature of the vertices we neglect the last one and as it equals to the first
    for (let i = 1; i < vertices.length; i++){
        let prj = axis.dot( vertices[i] )
        min = Math.min(prj, min)
        max = Math.max(prj, max)
    }

    return [min, max]
}

function overlap(prj1, prj2){
    return !(prj1[1] < prj2[0] || prj2[1] < prj1[0])
}

function getPerpAxes(vertices){
    const axes = []
    for (let i = 0; i < vertices.length; i++){
        const p1 = vertices[i]
        const p2 = vertices[(i + 1) % vertices.length] // Ensure cycle possibility for the last and first vertices
        const edge = p2.sub(p1)
        const normal = new Vector2( -edge.y, edge.x )
        axes.push(normal)
    }

    return axes
}

function areColliding(vertices1, vertices2){
    const axes1 = getPerpAxes(vertices1)
    const axes2 = getPerpAxes(vertices2)

    let translations = []
    for (const axis of axes1.concat(axes2)){
        const prj1 = projectPoly(axis, vertices1)
        const prj2 = projectPoly(axis, vertices2)
        if (!overlap(prj1, prj2)){
            return [false, new Vector2(0, 0)]
        }

        let ol = Math.abs(prj2[1] - prj1[0])
        let ofs = axis.mul(ol).unit().mul(35)
        translations.push(ofs)
    }

    translations.sort((a, b) => {
        return a.mag() < b.mag()
    })

    return [true, translations[0]]
}

let vp_width = 650
let vp_height = 550

let g = 4
let restitution = 1

let physics_calculation_last_step = {}

const objects = []
class Object{
    constructor(sides, size, mass, position, initial_velocity, color){
        var [svg, polygon, text, vertices] = CreateSVG(sides, size.x, size.y, color)
        text.innerHTML = mass
        this.svg = svg
        this.polygon = polygon
        this.text = text
        this.vertices = vertices
        this.sides = sides
        this.size = size
        this.mass = mass
        this.position = position
        this.velocity = initial_velocity
        this.fixed = false
        objects.push( this )
        this.id = objects.length
        this.rotate = 0
        this.torque = 180
    }

    setFixed(val){
        this.fixed = val
    }

    update(dt){
        this.vertices = UpdateSVG(this)

        this.rotate += this.torque*dt

        if (this.fixed){
            this.svg.style.marginLeft = this.position.x - this.size.x + "px"
            this.svg.style.marginTop = this.position.y - this.size.y + "px"
            return
        }

        let F = new Vector2(0, 0)
        F = F.sub( new Vector2(0, -this.mass*g) )

        let acceleration = F.div(this.mass)

        this.velocity = this.velocity.add( acceleration )
        
        this.position = this.position.add( this.velocity.mul(dt) )
        if (this.position.x == NaN || this.position.y == NaN){
            this.position = new Vector2(0, 0)
        }

        if (this.position.y >= vp_height - this.size.y/2 && this.velocity.y > 0){
            this.velocity = new Vector2(this.velocity.x, -this.velocity.y, this.velocity.z)
        }

        if (this.position.y <= this.size.y && this.velocity.y < 0){
            this.velocity = new Vector2(this.velocity.x, -this.velocity.y, this.velocity.z)
        }

        if (this.position.x >= vp_width - this.size.x/2 && this.velocity.x > 0){
            this.velocity = new Vector2(-this.velocity.x, this.velocity.y, this.velocity.z)
        }

        if (this.position.x <= this.size.x && this.velocity.x < 0){
            this.velocity = new Vector2(-this.velocity.x, this.velocity.y, this.velocity.z)
        }
    
        this.position = new Vector2(
            clamp(this.position.x, this.size.x, vp_width - this.size.x/2),
            clamp(this.position.y, this.size.y, vp_height - this.size.y/2)
        )

        this.svg.style.marginLeft = this.position.x - this.size.x + "px"
        this.svg.style.marginTop = this.position.y - this.size.y + "px"

        this.svg.style.width = this.size.x + "px"
        this.svg.style.height = this.size.y + "px"
    }

    checkCollisions(){
        const vertices1 = this.vertices.map(v => v.add(this.position))
        for (const obj of objects){
            if (obj !== this){
                const vertices2 = obj.vertices.map(v => v.add(obj.position))

                const data = areColliding(vertices1, vertices2)
                const colliding = data[0]
                const translation = data[1]
                if (colliding){
                    console.log(translation.mag())
                    if (physics_calculation_last_step[obj.id + " " + this.id] == true || physics_calculation_last_step[this.id + " " + obj.id] == true){
                        continue
                    }

                    physics_calculation_last_step[obj.id + " " + this.id] = true

                    // this.position = this.position.add(translation)
                    const relativeVelocity = this.velocity.sub(obj.velocity)
                    let dir = this.velocity.sub(obj.velocity).unit()
                    const impulse = dir.mul(relativeVelocity.dot(dir) * (1 + restitution) / (1 / this.mass + 1 / obj.mass))
                    this.velocity = this.velocity.sub( impulse.div(this.mass) )
                    obj.velocity = obj.velocity.add( impulse.div(obj.mass) )
                } else {
                    physics_calculation_last_step[obj.id + " " + this.id] = false
                }
            }
        }
    }
}

function CreateSVG(sides, w, h, color){
    const svg = document.createElementNS(svgNS, "svg")
    svg.setAttribute("width", w*2)
    svg.setAttribute("height", h*2)
    svg.classList.add("object_svg")
    container.appendChild(svg)

    let last_point = null

    let vertices = []
    let points = ""
    for (let a = 0; a <= 360 + 360/sides/2; a += 360/sides){
        let rad_a = (90 - 360/sides/2 + a)/180*Math.PI
        
        let x = Math.cos(rad_a)*w + w
        let y = Math.sin(rad_a)*h + h
        if (last_point != null){
            /*
            const line = document.createElementNS(svgNS, "line")
            line.classList.add("object_line")
            line.setAttribute("x1", last_point[0])
            line.setAttribute("y1", last_point[1])
            line.setAttribute("x2", x)
            line.setAttribute("y2", y)
            svg.appendChild(line)
            */
        }

        points += `${x},${y} `
        last_point = [x, y]
        vertices.push( new Vector2(x, y) )
    }

    const polygon = document.createElementNS(svgNS, "polygon");
    polygon.classList.add("object_polygon");
    polygon.style.fill = color
    polygon.setAttribute("points", points.trim());
    svg.appendChild(polygon);
    const text = document.createElementNS(svgNS, "text")
    text.setAttribute("font-family", "Roboto")
    text.setAttribute("text-anchor", "middle")
    text.setAttribute("dominant-baseline", "middle")
    text.setAttribute("font-weight", "1000")
    svg.appendChild(text)
    return [svg, polygon, text, vertices]
}

function UpdateSVG(obj){
    const svg = obj.svg

    let last_point = null

    let sides = obj.sides
    let w = obj.size.x
    let h = obj.size.y

    // Bounding box vectors
    let min = [Infinity, Infinity]
    let max = [-Infinity, -Infinity]

    let vertices = []
    let points = ""
    for (let a = 0; a <= 360 + 360/sides/2; a += 360/sides){
        let rad_a = (90 - 360/sides/2 + a + obj.rotate)/180*Math.PI

        let x = Math.cos(rad_a)*w
        let y = Math.sin(rad_a)*h

        min[0] = Math.min(min[0], x)
        min[1] = Math.min(min[1], y)

        max[0] = Math.max(max[0], x)
        max[1] = Math.max(max[1], y)

        x += w
        y += h

        if (last_point != null){
            /*
            const line = document.createElementNS(svgNS, "line")
            line.classList.add("object_line")
            line.setAttribute("x1", last_point[0])
            line.setAttribute("y1", last_point[1])
            line.setAttribute("x2", x)
            line.setAttribute("y2", y)
            svg.appendChild(line)
            */
        }

        points += `${x},${y} `
        last_point = [x, y]
        vertices.push( new Vector2(x, y) ) 
    }

    const nw = Math.floor(max[0] - min[0])
    const nh = Math.floor(max[1] - min[1])
    // obj.size = new Vector2(nw, nh)

    const polygon = obj.polygon
    polygon.style.fill = obj.color
    polygon.setAttribute("points", points.trim());
    const text = obj.text
    text.setAttribute("x", w)
    text.setAttribute("y", h)
    return vertices
}


let SPS = 60 // Physics steps per second
let dt = 1/SPS
setInterval(() => {
    objects.forEach(e => {
        e.update(dt)
    });

    for (const obj of objects){
        obj.checkCollisions()
    }

    // physics_calculation_last_step = []
}, 1000*1/SPS);

function randomRange(a, b){
    return Math.floor( a + (b - a) * Math.random() )
}

const colors = [
    "rgb(255, 0, 0)",
    "rgb(125, 255, 0)",
    "rgb(0, 125, 255)",
    "rgb(235, 235, 15)",
    "rgb(255, 0, 90)"
]

let current_color = 0

const sides_input = document.getElementById("sides_input")
document.getElementById("add").addEventListener("click", () => {
    const sides = sides_input.value
    if (sides > 2){
        new Object(
            sides, // Number of sides
            (new Vector2(1, 1)).mul(40), // Size
            randomRange(50, 1000), // Mass
            new Vector2(randomRange(70, 500), randomRange(20, 20)), // Initial position
            new Vector2(randomRange(-300, 300), randomRange(0, 0)), // Initial velocity
            colors[current_color] // Color
        )

        current_color = (current_color + 1) % colors.length
    }
})
