class Vector2 {
  x: number
  y: number
  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y
  }

  normalize() {
    const length = Math.sqrt(this.lengthSq()) || 1
    this.x /= length
    this.y /= length
    return this
  }

  set(x: number, y: number) {
    this.x = x
    this.y = y
    return this
  }

  angle() {
    return Math.atan2(this.y, this.x)
  }

  dot(other: Vector2) {
    return this.x * other.x + this.y * other.y
  }
}

const PhaserStub = {
  Scene: class {},
  Math: {
    Vector2,
    Between: () => 0,
    FloatBetween: () => 0,
    DegToRad: () => 0,
    Clamp: (value: number) => value,
    Angle: { Between: () => 0 },
    Distance: { Between: () => 0 },
    Interpolation: { Linear: () => 0 },
  },
  Input: { Keyboard: { KeyCodes: {} } },
  Types: { Input: { Keyboard: {} } },
  Physics: { Arcade: { Sprite: class {}, Group: class {}, Body: class {} } },
  GameObjects: {
    Image: class {},
    Text: class {},
    Rectangle: class {},
    Graphics: class {},
    Circle: class {},
  },
  Time: { TimerEvent: class {} },
}

export default PhaserStub
