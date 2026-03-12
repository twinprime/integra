import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CreateNodeDialog } from "./CreateNodeDialog"

const defaultProps = {
  title: "Add Sequence Diagram",
  placeholder: "my_feature",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("CreateNodeDialog", () => {
  it("renders the title", () => {
    render(<CreateNodeDialog {...defaultProps} />)
    expect(screen.getByText("Add Sequence Diagram")).toBeInTheDocument()
  })

  it("renders ID and Name inputs", () => {
    render(<CreateNodeDialog {...defaultProps} />)
    expect(screen.getByPlaceholderText("my_feature")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Display name")).toBeInTheDocument()
  })

  it("auto-derives name from id as user types", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const idInput = screen.getByPlaceholderText("my_feature")
    await user.type(idInput, "my_feature")
    expect(screen.getByDisplayValue("My Feature")).toBeInTheDocument()
  })

  it("allows user to manually override the name", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const nameInput = screen.getByPlaceholderText("Display name")
    await user.type(nameInput, "Custom Name")
    expect(screen.getByDisplayValue("Custom Name")).toBeInTheDocument()
  })

  it("does not update name after user has manually edited it", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const idInput = screen.getByPlaceholderText("my_feature")
    const nameInput = screen.getByPlaceholderText("Display name")

    await user.type(idInput, "first")
    await user.clear(nameInput)
    await user.type(nameInput, "Custom Name")
    // Now type more in id — name should remain "Custom Name"
    await user.clear(idInput)
    await user.type(idInput, "second_thing")
    expect(screen.getByDisplayValue("Custom Name")).toBeInTheDocument()
  })

  it("shows ID required error when submitting empty id", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    await user.click(screen.getByText("Create"))
    expect(screen.getByText("ID is required.")).toBeInTheDocument()
    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
  })

  it("shows ID format error for invalid id", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const idInput = screen.getByPlaceholderText("my_feature")
    await user.type(idInput, "123invalid")
    await user.click(screen.getByText("Create"))
    expect(
      screen.getByText("Must start with a letter or _ and contain only letters, digits, or _."),
    ).toBeInTheDocument()
    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
  })

  it("shows Name required error when name is cleared", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const idInput = screen.getByPlaceholderText("my_feature")
    const nameInput = screen.getByPlaceholderText("Display name")
    await user.type(idInput, "valid_id")
    await user.clear(nameInput)
    await user.click(screen.getByText("Create"))
    expect(screen.getByText("Name is required.")).toBeInTheDocument()
    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
  })

  it("calls onConfirm with id and name on valid submit", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const idInput = screen.getByPlaceholderText("my_feature")
    await user.type(idInput, "my_feature")
    await user.click(screen.getByText("Create"))
    expect(defaultProps.onConfirm).toHaveBeenCalledWith("my_feature", "My Feature")
  })

  it("calls onConfirm with custom name when name was manually set", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const idInput = screen.getByPlaceholderText("my_feature")
    const nameInput = screen.getByPlaceholderText("Display name")
    await user.type(idInput, "my_feature")
    await user.clear(nameInput)
    await user.type(nameInput, "Custom Name")
    await user.click(screen.getByText("Create"))
    expect(defaultProps.onConfirm).toHaveBeenCalledWith("my_feature", "Custom Name")
  })

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    await user.click(screen.getByText("Cancel"))
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })

  it("submits on Enter key press in ID field", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const idInput = screen.getByPlaceholderText("my_feature")
    await user.type(idInput, "valid_id")
    await user.keyboard("{Enter}")
    expect(defaultProps.onConfirm).toHaveBeenCalledWith("valid_id", "Valid Id")
  })

  it("submits on Enter key press in Name field", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const idInput = screen.getByPlaceholderText("my_feature")
    await user.type(idInput, "valid_id")
    const nameInput = screen.getByPlaceholderText("Display name")
    await user.click(nameInput)
    await user.keyboard("{Enter}")
    expect(defaultProps.onConfirm).toHaveBeenCalledWith("valid_id", "Valid Id")
  })

  it("calls onCancel on Escape key", () => {
    render(<CreateNodeDialog {...defaultProps} />)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })

  it("dialog stays open (onConfirm not called) when id is invalid", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const idInput = screen.getByPlaceholderText("my_feature")
    await user.type(idInput, "1bad")
    await user.click(screen.getByText("Create"))
    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
    // Dialog is still rendered
    expect(screen.getByText("Add Sequence Diagram")).toBeInTheDocument()
  })

  it("shows both errors simultaneously when both fields are invalid", async () => {
    const user = userEvent.setup()
    render(<CreateNodeDialog {...defaultProps} />)
    const nameInput = screen.getByPlaceholderText("Display name")
    await user.type(screen.getByPlaceholderText("my_feature"), "1bad")
    await user.clear(nameInput)
    await user.click(screen.getByText("Create"))
    expect(
      screen.getByText("Must start with a letter or _ and contain only letters, digits, or _."),
    ).toBeInTheDocument()
    expect(screen.getByText("Name is required.")).toBeInTheDocument()
  })
})
