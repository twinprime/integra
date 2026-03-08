import { Box, User, FileText, Share2, Activity, Folder } from "lucide-react"

export const NodeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "component":
      return <Box size={16} className="text-blue-500" />
    case "actor":
      return <User size={16} className="text-green-500" />
    case "use-case":
      return <FileText size={16} className="text-orange-500" />
    case "use-case-diagram":
      return <Share2 size={16} className="text-purple-400" />
    case "sequence-diagram":
      return <Activity size={16} className="text-indigo-500" />
    default:
      return <Folder size={16} className="text-gray-400" />
  }
}
